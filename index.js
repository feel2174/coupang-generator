require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const crypto = require('crypto');
const path = require('path');
const moment = require('moment');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 키 확인
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

if (!process.env.COUPANG_ACCESS_KEY || !process.env.COUPANG_SECRET_KEY) {
  console.error('쿠팡 API 키가 설정되지 않았습니다.');
  process.exit(1);
}

// 워드프레스 설정 확인 (선택사항)
if (!process.env.WP_URL || !process.env.WP_USER || !process.env.WP_PASSWORD) {
  console.warn(
    '워드프레스 설정이 없습니다. 워드프레스 자동 포스팅 기능이 비활성화됩니다.',
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const COUPANG_ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const COUPANG_SECRET_KEY = process.env.COUPANG_SECRET_KEY;

const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_PASSWORD = process.env.WP_PASSWORD;

function generateCoupangSignature(method, url) {
  try {
    const parts = url.split(/\?/);
    const [path, query = ''] = parts;

    const datetime = moment.utc().format('YYMMDD[T]HHmmss[Z]');
    const message = datetime + method + path + query;

    console.log('서명 생성 정보:', {
      datetime,
      method,
      path,
      query,
      message,
    });

    const signature = crypto
      .createHmac('sha256', COUPANG_SECRET_KEY)
      .update(message)
      .digest('hex');

    const authorization = `CEA algorithm=HmacSHA256, access-key=${COUPANG_ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;

    console.log('생성된 서명:', {
      signature,
      authorization,
    });

    return authorization;
  } catch (error) {
    console.error('서명 생성 에러:', error);
    throw new Error(`서명 생성 실패: ${error.message}`);
  }
}

// 쿠팡 상품 검색 API 호출
async function searchCoupangProducts(keyword) {
  console.log('검색 시작:', keyword);

  try {
    const baseUrl =
      '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
    const queryParams = `keyword=${encodeURIComponent(keyword)}&limit=1`;
    const url = `${baseUrl}?${queryParams}`;

    console.log('API URL 구성:', {
      baseUrl,
      queryParams,
      fullUrl: `https://api-gateway.coupang.com${url}`,
    });

    const authorization = generateCoupangSignature('GET', url);

    console.log('API 요청 준비:', {
      method: 'GET',
      url: `https://api-gateway.coupang.com${url}`,
      authorization,
    });

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
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      },
    });

    console.log('API 응답 수신:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
    });

    if (response.status !== 200) {
      throw new Error(
        `쿠팡 API 응답 에러: ${response.status} - ${JSON.stringify(
          response.data,
        )}`,
      );
    }

    if (!response.data) {
      throw new Error('쿠팡 API 응답 데이터가 없습니다.');
    }

    return response.data;
  } catch (error) {
    console.error('쿠팡 API 호출 에러:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        headers: error.config?.headers,
      },
    });
    throw new Error(`쿠팡 API 호출 실패: ${error.message}`);
  }
}

// GPT를 사용하여 블로그 포스팅 생성
async function generateBlogPost(products, keyword) {
  console.log('블로그 포스팅 생성 시작');

  try {
    console.log('받은 상품 데이터:', JSON.stringify(products, null, 2));

    if (!products || !products.data || !products.data.productData) {
      throw new Error('상품 데이터가 올바른 형식이 아닙니다.');
    }

    // 상품 정보 가공
    const productInfo = products.data.productData.map(product => ({
      name: product.productName,
      price: product.productPrice,
      image: product.productImage,
      url: product.productUrl,
      description: product.productDescription || '',
      category: product.categoryName || '',
      rating: product.productRating || 0,
      reviewCount: product.reviewCount || 0,
    }));

    console.log('가공된 상품 정보:', productInfo);

    if (!productInfo || productInfo.length === 0) {
      throw new Error('가공된 상품 정보가 없습니다.');
    }

    const prompt = `
너는 고급 제품 리뷰 전문 작가이자 SEO 전문가야. 검색엔진과 사용자 모두를 만족시키는 매력적인 리뷰를 작성해줘.

[제목 작성 가이드]
- 검색 키워드 + 감정을 자극하는 문장 (예: "${keyword} 후기 - 솔직하게 말해보는 장단점과 구매 가이드")
- 감정 키워드 예시: 솔직한, 놀라운, 완벽한, 실망스러운, 게임체인저, 믿을 수 없는

[HTML 구조 - 반드시 이 순서대로 작성]

1. 포스팅 시작:
<article>
  <h1 style="color:#222; font-weight:900; font-size:2em; margin-bottom:20px; line-height:1.3;">[검색키워드 + 감정문구 제목]</h1>

  <!-- 3줄 요약 도입부 -->
  <div style="background:#f8f9fa; padding:20px; border-left:4px solid #346aff; margin:20px 0; border-radius:8px;">
    <p style="font-size:1.1em; color:#333; margin:5px 0; font-weight:500;">✅ [사용자의 고민 1]: 이런 문제로 고민하고 계시나요?</p>
    <p style="font-size:1.1em; color:#333; margin:5px 0; font-weight:500;">✅ [사용자의 고민 2]: 어떤 제품을 선택해야 할지 막막하시죠?</p>
    <p style="font-size:1.1em; color:#333; margin:5px 0; font-weight:500;">✅ [결론]: 이 글을 통해 ${keyword}의 모든 궁금증을 해결하세요!</p>
  </div>

  <div style="display:flex; flex-wrap:wrap; align-items:center; margin-bottom:25px;">
    <a href="[상품링크]" target="_blank" rel="noopener noreferrer">
      <img src="[상품이미지]" alt="[상품명]" style="max-width:300px; border-radius:12px; margin-right:24px; box-shadow:0 4px 12px rgba(52,106,255,0.09);"/>
    </a>
    <div style="flex:1;">
      <div style="font-size:1.3em; color:#346aff; font-weight:bold; margin-bottom:8px;">
        [상품명]
      </div>
      <div style="font-size:1.1em; color:#555; margin-bottom:4px;">
        카테고리: [카테고리]
      </div>
      <div style="font-size:1.1em; color:#222;">
        가격: <span style="color:#346aff; font-weight:bold;">[가격]원</span>
      </div>
      <a href="[상품링크]" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:12px; padding:12px 20px; background:#346aff; color:#fff; border-radius:8px; font-weight:600; text-decoration:none; font-size:1.1em;">
        🛒 지금 바로 확인하기
      </a>
    </div>
  </div>

2. 본문 구성 (H2/H3 체계적 구성):
<h2 style="color:#346aff; font-weight:bold; font-size:1.5em; margin-top:30px; margin-bottom:15px;">${keyword} 선택한 이유</h2>
<h3 style="color:#333; font-weight:600; font-size:1.2em; margin-top:20px;">구매 전 고민했던 점들</h3>
<h3 style="color:#333; font-weight:600; font-size:1.2em; margin-top:20px;">최종 결정한 핵심 이유</h3>

<h2 style="color:#346aff; font-weight:bold; font-size:1.5em; margin-top:30px; margin-bottom:15px;">${keyword} 실제 사용 후기</h2>
<h3 style="color:#333; font-weight:600; font-size:1.2em; margin-top:20px;">첫 사용 인상</h3>
<h3 style="color:#333; font-weight:600; font-size:1.2em; margin-top:20px;">장기 사용 경험</h3>

<!-- 중간 CTA -->
<div style="background:linear-gradient(135deg, #346aff, #4dabf7); padding:20px; border-radius:12px; text-align:center; margin:30px 0; color:white;">
  <h3 style="color:white; margin-bottom:10px;">💡 지금이 구매 타이밍인 이유</h3>
  <p style="margin-bottom:15px; font-size:1.1em;">더 늦기 전에 확인해보세요!</p>
  <a href="[상품링크]" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:12px 30px; background:white; color:#346aff; border-radius:8px; font-weight:600; text-decoration:none; font-size:1.1em;">
    🎯 최저가 확인하기
  </a>
</div>

<h2 style="color:#346aff; font-weight:bold; font-size:1.5em; margin-top:30px; margin-bottom:15px;">${keyword} 솔직한 단점</h2>

<h2 style="color:#346aff; font-weight:bold; font-size:1.5em; margin-top:30px; margin-bottom:15px;">${keyword} 총평 및 추천</h2>
<h3 style="color:#333; font-weight:600; font-size:1.2em; margin-top:20px;">이런 분께 추천합니다</h3>
<h3 style="color:#333; font-weight:600; font-size:1.2em; margin-top:20px;">구매 전 체크리스트</h3>

3. 마무리 (요약 + 관련 글):
<div style="background:#f8f9fa; padding:20px; border-radius:8px; margin:30px 0;">
  <h3 style="color:#346aff; margin-bottom:15px;">📝 ${keyword} 리뷰 요약</h3>
  <p style="font-size:1.1em; line-height:1.6; color:#333; margin-bottom:10px;">• [핵심 장점 요약 1줄]</p>
  <p style="font-size:1.1em; line-height:1.6; color:#333;">• [구매 결정에 도움되는 정보 1줄]</p>
</div>

<div style="border-top:2px solid #346aff; padding-top:20px; margin-top:30px;">
  <h3 style="color:#346aff; margin-bottom:15px;">🔗 함께 보면 좋은 글</h3>
  <p style="font-size:1.1em; color:#666;">
    • <a href="#" style="color:#346aff; text-decoration:none;">[카테고리] 추천 제품 비교 가이드</a><br>
    • <a href="#" style="color:#346aff; text-decoration:none;">[카테고리] 구매 전 필수 체크사항</a><br>
    • <a href="#" style="color:#346aff; text-decoration:none;">[관련 키워드] 사용법 완벽 가이드</a>
  </p>
</div>

[작성 가이드라인]
- 모든 텍스트: style="font-size:1.1em; line-height:1.6; color:#333;"
- 강조 내용: <strong style="color:#346aff;">텍스트</strong>
- 각 섹션 최소 300자 이상, 구체적이고 개인적인 경험 위주
- 광고 느낌 없이 진솔한 사용자 후기 톤
- 키워드를 자연스럽게 H2/H3에 반복 사용
- 중간중간 이모지 활용으로 가독성 향상

상품 정보: ${JSON.stringify(productInfo, null, 2)}
키워드: ${keyword}`;

    console.log('GPT API 요청 준비:', { prompt });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content:
            '당신은 SEO 최적화와 사용자 경험을 모두 고려하는 전문 콘텐츠 마케터입니다. 검색엔진에서 상위 노출되면서도 독자가 끝까지 읽고 싶어하는 매력적인 리뷰를 작성해주세요. 감정적 어필과 논리적 정보 제공의 균형을 맞춰 독자의 구매 결정을 돕는 고품질 콘텐츠를 만들어주세요.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 3500,
    });

    console.log('GPT API 응답:', completion.choices[0].message);

    // GPT 응답에 배너 추가
    const gptContent = completion.choices[0].message.content;
    const banners = `


<!-- 쿠팡 파트너스 안내문구 -->
<div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; font-size: 14px; color: #666; text-align: center;">
  <a href="https://link.coupang.com/a/cukenB" target="_blank" rel="noopener noreferrer">
    <img src="https://static.coupangcdn.com/image/coupang/common/logo_coupang_w350.png" alt="쿠팡 프로모션" style="max-width:200px; margin-bottom:8px;">
    <div>이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</div>
  </a>
</div>`;

    return gptContent + banners;
  } catch (error) {
    console.error('GPT API 호출 에러:', error);
    throw new Error(`GPT API 호출 실패: ${error.message}`);
  }
}

// 워드프레스에 포스팅하는 함수
async function postToWordPress(title, content, keyword) {
  console.log('워드프레스 포스팅 시작');

  if (!WP_URL || !WP_USER || !WP_PASSWORD) {
    console.log('워드프레스 설정이 없어 건너뜁니다.');
    return { success: false, message: '워드프레스 설정이 없습니다.' };
  }

  try {
    const wpApiUrl = `${WP_URL}/posts`;

    // Basic Auth 인증 헤더 생성
    const authString = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString(
      'base64',
    );

    // 포스트 데이터 준비
    const postData = {
      title: title,
      content: content,
      status: 'draft', // 'publish' 또는 'draft'
      categories: [3],
      excerpt: `${keyword}에 대한 상세한 리뷰와 정보를 확인해보세요.`,
      // categories와 tags는 ID 배열이 필요하므로 제거
      // meta 필드는 기본 REST API에서 지원되지 않을 수 있으므로 제거
    };

    console.log('워드프레스 API 요청:', {
      url: wpApiUrl,
      title: postData.title,
      status: postData.status,
    });

    const response = await axios({
      method: 'POST',
      url: wpApiUrl,
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: postData,
      timeout: 30000,
    });

    console.log('워드프레스 포스팅 성공:', {
      id: response.data.id,
      title: response.data.title.rendered,
      status: response.data.status,
      link: response.data.link,
    });

    return {
      success: true,
      postId: response.data.id,
      postUrl: response.data.link,
      status: response.data.status,
      message: '워드프레스에 성공적으로 포스팅되었습니다.',
    };
  } catch (error) {
    console.error('워드프레스 포스팅 에러:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });

    return {
      success: false,
      error: error.message,
      message: '워드프레스 포스팅에 실패했습니다.',
    };
  }
}

// HTML에서 제목 추출하는 함수
function extractTitleFromHTML(htmlContent) {
  try {
    // h1 태그에서 제목 추출
    const h1Match = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // h1이 없으면 첫 번째 텍스트 사용
    const textMatch = htmlContent.match(/>([^<]{10,})</);
    if (textMatch) {
      return textMatch[1].trim().substring(0, 50) + '...';
    }

    return '쿠팡 상품 리뷰';
  } catch (error) {
    console.error('제목 추출 에러:', error);
    return '쿠팡 상품 리뷰';
  }
}

// HTML에서 h1 태그를 제거하는 함수
function removeH1FromHTML(htmlContent) {
  try {
    // h1 태그와 그 내용을 완전히 제거
    const cleanedContent = htmlContent.replace(/<h1[^>]*>.*?<\/h1>/gi, '');

    // 연속된 빈 줄이나 불필요한 공백 정리
    return cleanedContent
      .replace(/^\s*\n/gm, '') // 빈 줄 제거
      .replace(/\n\s*\n\s*\n/g, '\n\n') // 연속된 빈 줄을 하나로
      .trim();
  } catch (error) {
    console.error('H1 태그 제거 에러:', error);
    return htmlContent;
  }
}

// 워드프레스용 제목과 본문을 분리하는 함수
function prepareContentForWordPress(htmlContent) {
  try {
    const title = extractTitleFromHTML(htmlContent);
    const contentWithoutH1 = removeH1FromHTML(htmlContent);

    return {
      title: title,
      content: contentWithoutH1,
    };
  } catch (error) {
    console.error('워드프레스 콘텐츠 준비 에러:', error);
    return {
      title: '쿠팡 상품 리뷰',
      content: htmlContent,
    };
  }
}

// API 엔드포인트
app.post('/generate-post', async (req, res) => {
  console.log('새로운 요청 수신');

  try {
    const { keyword, autoPostToWordPress = false } = req.body;
    console.log('요청 데이터:', { keyword, autoPostToWordPress });

    if (!keyword) {
      console.log('키워드 누락');
      return res.status(400).json({
        success: false,
        error: '키워드를 입력해주세요.',
      });
    }

    console.log('쿠팡 상품 검색 시작');
    const products = await searchCoupangProducts(keyword);

    console.log('블로그 포스팅 생성 시작');
    const blogPost = await generateBlogPost(products, keyword);

    let wordpressResult = null;

    // 워드프레스 자동 포스팅 옵션이 활성화된 경우
    if (autoPostToWordPress) {
      console.log('워드프레스 자동 포스팅 시작');
      const { title, content } = prepareContentForWordPress(blogPost);
      wordpressResult = await postToWordPress(title, content, keyword);
    }

    console.log('응답 전송');
    res.json({
      success: true,
      blogPost: blogPost,
      wordpress: wordpressResult,
    });
  } catch (error) {
    console.error('전체 프로세스 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message || '서버 에러가 발생했습니다.',
    });
  }
});

// 워드프레스 수동 포스팅 엔드포인트
app.post('/post-to-wordpress', async (req, res) => {
  console.log('워드프레스 수동 포스팅 요청');

  try {
    const { title, content, keyword } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: '내용을 입력해주세요.',
      });
    }

    let finalTitle = title;
    let finalContent = content;

    // 제목이 없으면 HTML에서 추출하고 h1 태그 제거
    if (!title) {
      const prepared = prepareContentForWordPress(content);
      finalTitle = prepared.title;
      finalContent = prepared.content;
    } else {
      // 제목이 있어도 본문에서 h1 태그는 제거
      finalContent = removeH1FromHTML(content);
    }

    const result = await postToWordPress(finalTitle, finalContent, keyword);

    res.json(result);
  } catch (error) {
    console.error('워드프레스 포스팅 에러:', error);
    res.status(500).json({
      success: false,
      error: error.message || '서버 에러가 발생했습니다.',
    });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(
    `http://localhost:${PORT} 에서 웹 인터페이스를 확인할 수 있습니다.`,
  );

  if (WP_URL) {
    console.log(`워드프레스 연동: ${WP_URL}`);
  } else {
    console.log('워드프레스 연동: 비활성화');
  }
});
