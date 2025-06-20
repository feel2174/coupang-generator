const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const moment = require('moment');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const COUPANG_ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const COUPANG_SECRET_KEY = process.env.COUPANG_SECRET_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function generateCoupangSignature(method, url) {
  const parts = url.split(/\?/);
  const [path, query = ''] = parts;
  const datetime = moment.utc().format('YYMMDD[T]HHmmss[Z]');
  const message = datetime + method + path + query;
  const signature = crypto
    .createHmac('sha256', COUPANG_SECRET_KEY)
    .update(message)
    .digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${COUPANG_ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
}

async function searchCoupangProducts(keyword, limit = 5) {
  const baseUrl =
    '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
  const queryParams = `keyword=${encodeURIComponent(keyword)}&subId=wordpress&limit=${limit}`;
  const url = `${baseUrl}?${queryParams}`;
  const authorization = generateCoupangSignature('GET', url);
  const response = await axios({
    method: 'GET',
    url: `https://api-gateway.coupang.com${url}`,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    },
    timeout: 10000,
    validateStatus: status => status >= 200 && status < 500,
  });
  if (response.status !== 200 || !response.data) {
    throw new Error('쿠팡 API 호출 실패');
  }
  return response.data;
}

function loadPrompt(filename) {
  try {
    const promptPath = path.join(__dirname, 'prompts', filename);
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf8');
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function generateProductReview(product, keyword) {
  let promptTemplate = loadPrompt('product-review-prompt.txt');
  if (!promptTemplate) {
    promptTemplate = `너는 고급 제품 리뷰 전문 작가이자 SEO 전문가야. 아래 상품에 대해 블로그 포스팅에 어울리는 2~3문장짜리 간단한 설명과 후기, 특징을 써줘.\n\n- 반드시 다른 상품과 겹치지 않는 독창적인 관점으로 작성해.\n- 이모티콘도 자연스럽게 활용해도 좋아.\n- 너무 길지 않게, 실제 사용자의 느낌처럼 써줘.\n- SEO 최적화를 위해 반드시 상품명(키워드)을 포함한 h2 태그로 시작해.\n- 주요 특징/장점/후기는 <ul> 또는 <strong> 태그 등으로 강조해줘.\n- 각 description(설명)은 반드시 상품명을 기준으로 작성해. (예: 상품명으로 시작하거나, 상품명을 중심으로 설명)\n\n예시:\n<h2>{name}</h2>\n<ul>\n  <li>특징1</li>\n  <li>특징2</li>\n</ul>\n<p>간단한 후기/느낌 😄</p>\n\n상품명: {name}\n카테고리: {category}\n가격: {price}\n리뷰수: {reviewCount}\n키워드: {keyword}\n설명: {description}\n\n설명:`;
  }
  const name = product.name || product.productName || '';
  const prompt = promptTemplate
    .replace(/{name}/g, name)
    .replace(/{category}/g, product.category)
    .replace(/{price}/g, product.price ? product.price + '원' : '-')
    .replace(/{reviewCount}/g, product.reviewCount)
    .replace(/{keyword}/g, keyword)
    .replace(/{description}/g, product.description)
    .replace(/{image}/g, product.image || product.productImage || '')
    .replace(/{url}/g, product.url || product.productUrl || '');
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: '너는 블로그 리뷰 전문 작가야. 간결하고 신뢰감 있게 써줘.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    // max_tokens: 1000,
  });
  return completion.choices[0].message.content.trim();
}

// GET /coupang-products?keyword=xxx&limit=5
router.get('/', async (req, res) => {
  const keyword = req.query.keyword;
  const limit = parseInt(req.query.limit, 10) || 5;
  if (!keyword) {
    return res
      .status(400)
      .json({ success: false, error: 'keyword 쿼리 파라미터가 필요합니다.' });
  }
  try {
    const data = await searchCoupangProducts(keyword, limit);
    const products = data.data?.productData || [];
    // 각 상품별로 GPT 설명 생성 (병렬)
    const productsWithReview = await Promise.all(
      products.map(async product => {
        const review = await generateProductReview(product, keyword);
        return {
          name: product.productName,
          price: product.productPrice,
          image: product.productImage,
          url: product.productUrl,
          description: product.productDescription || '',
          category: product.categoryName || '',
          rating: product.productRating || 0,
          reviewCount: product.reviewCount || 0,
          gptReview: review,
        };
      }),
    );
    res.json({ success: true, products: productsWithReview });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
