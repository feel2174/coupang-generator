require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const crypto = require('crypto');
const path = require('path');
const moment = require('moment');
const fs = require('fs');
const FormData = require('form-data');

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

// 프롬프트 파일 읽기 함수
function loadPrompt(filename) {
  try {
    const promptPath = path.join(__dirname, 'prompts', filename);
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf8');
    } else {
      console.warn(`프롬프트 파일을 찾을 수 없습니다: ${promptPath}`);
      return null;
    }
  } catch (error) {
    console.error('프롬프트 파일 읽기 에러:', error);
    return null;
  }
}

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

    // 프롬프트 우선순위: 1) .env 파일, 2) 프롬프트 파일, 3) 기본 프롬프트
    let promptTemplate = process.env.BLOG_POST_PROMPT; // .env에서 읽기

    if (!promptTemplate) {
      promptTemplate = loadPrompt('blog-post-prompt.txt'); // 파일에서 읽기
    }

    if (!promptTemplate) {
      console.warn('프롬프트를 찾을 수 없어 기본 프롬프트를 사용합니다.');
      promptTemplate =
        '간단한 상품 리뷰를 작성해주세요. 상품 정보: {productInfo}, 키워드: {keyword}';
    }

    // 템플릿 변수 치환
    const prompt = promptTemplate
      .replace(/{keyword}/g, keyword)
      .replace(/{productInfo}/g, JSON.stringify(productInfo, null, 2));

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

    // HTML에서 첫 번째 이미지 URL 추출
    const imageMatch = content.match(/<img[^>]+src="([^">]+)"/);
    let featuredImageId = null;

    if (imageMatch) {
      const imageUrl = imageMatch[1];
      console.log('대표 이미지 URL 발견:', imageUrl);

      try {
        // 이미지 다운로드
        const imageResponse = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'arraybuffer',
        });

        // 임시 파일로 저장
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const tempFileName = `temp-image-${timestamp}-${randomStr}.jpg`;
        const tempFilePath = path.join(__dirname, tempFileName);

        fs.writeFileSync(tempFilePath, imageResponse.data);

        // FormData 생성
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath), {
          filename: tempFileName,
          contentType: 'image/jpeg',
        });

        // 워드프레스에 이미지 업로드
        const uploadResponse = await axios({
          method: 'POST',
          url: `${WP_URL}/media`,
          headers: {
            ...formData.getHeaders(),
            Authorization: `Basic ${authString}`,
          },
          data: formData,
        });

        if (uploadResponse.data && uploadResponse.data.id) {
          featuredImageId = uploadResponse.data.id;
          console.log('대표 이미지 업로드 성공:', featuredImageId);
        }

        // 임시 파일 삭제
        fs.unlinkSync(tempFilePath);
      } catch (imageError) {
        console.error('대표 이미지 업로드 실패:', imageError);
      }
    }

    // 포스트 데이터 준비
    const postData = {
      title: title,
      content: content,
      status: 'draft',
      categories: [3],
      excerpt: `${keyword}에 대한 상세한 리뷰와 정보를 확인해보세요.`,
      featured_media: featuredImageId,
    };

    console.log('워드프레스 API 요청:', {
      url: wpApiUrl,
      title: postData.title,
      status: postData.status,
      featuredImageId: featuredImageId,
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
      featuredImageId: featuredImageId,
    });

    return {
      success: true,
      postId: response.data.id,
      postUrl: response.data.link,
      status: response.data.status,
      featuredImageId: featuredImageId,
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
app.post('/api/generate-post', async (req, res) => {
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
app.post('/api/post-to-wordpress', async (req, res) => {
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
