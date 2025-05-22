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

// OpenAI 설정
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 쿠팡 파트너스 API 설정
const COUPANG_ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const COUPANG_SECRET_KEY = process.env.COUPANG_SECRET_KEY;

// 쿠팡 API 서명 생성 함수
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
            message
        });

        const signature = crypto.createHmac('sha256', COUPANG_SECRET_KEY)
            .update(message)
            .digest('hex');

        const authorization = `CEA algorithm=HmacSHA256, access-key=${COUPANG_ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`;
        
        console.log('생성된 서명:', {
            signature,
            authorization
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
        const baseUrl = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
        const queryParams = `keyword=${encodeURIComponent(keyword)}&limit=1`;
        const url = `${baseUrl}?${queryParams}`;
        
        console.log('API URL 구성:', {
            baseUrl,
            queryParams,
            fullUrl: `https://api-gateway.coupang.com${url}`
        });

        const authorization = generateCoupangSignature('GET', url);

        console.log('API 요청 준비:', {
            method: 'GET',
            url: `https://api-gateway.coupang.com${url}`,
            authorization
        });

        const response = await axios({
            method: 'GET',
            url: `https://api-gateway.coupang.com${url}`,
            headers: {
                'Authorization': authorization,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        });

        console.log('API 응답 수신:', {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data
        });

        if (response.status !== 200) {
            throw new Error(`쿠팡 API 응답 에러: ${response.status} - ${JSON.stringify(response.data)}`);
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
                headers: error.config?.headers
            }
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
            reviewCount: product.reviewCount || 0
        }));

        console.log('가공된 상품 정보:', productInfo);

        if (!productInfo || productInfo.length === 0) {
            throw new Error('가공된 상품 정보가 없습니다.');
        }

        const prompt = `
너는 제품/서비스 리뷰 전문 작가야. 각 항목은 최소 300자 이상으로 작성하고, 구글SEO를 준수하고, 상품의 이름과 입력된 키워드를 h2 태그에 반복적으로 사용해서 강조해줘. 
각 h2 태그에는 반드시 키워드가 포함되어야 하며, 자연스럽게 문장에 녹여서 SEO에 도움이 되도록 작성해. 
h2 태그에는 style="color:#346aff; font-weight:bold;" 속성을 추가해서 시각적으로도 강조해줘.

[HTML 작성 스타일 가이드]
1. 포스팅 시작은 반드시 아래 형식으로 시작:
<article>
  <h1 style="color:#222; font-weight:900; font-size:2em; margin-bottom:20px;">[상품명] 솔직 후기</h1>
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
      <a href="[상품링크]" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:12px; padding:10px 18px; background:#346aff; color:#fff; border-radius:8px; font-weight:600; text-decoration:none;">
        자세히 보기 & 구매하기
      </a>
    </div>
  </div>

2. 본문 구성:
- ① 제품 선택 이유
- ② 실제 사용 경험 및 좋았던 점
- ③ 아쉬운 점 1가지
- ④ 총평 + 추천 대상

3. 스타일 가이드:
- 모든 h2 태그는 style="color:#346aff; font-weight:bold;" 속성 포함
- 본문 텍스트는 style="font-size:1.1em; line-height:1.6; color:#333;" 스타일 적용
- 중요 내용은 <strong style="color:#346aff;">강조</strong> 처리
- 이미지는 style="max-width:100%; border-radius:8px; margin:20px 0;" 스타일 적용

4. 후기 작성:
- 광고 같지 않게, 진짜 사용자 말투로 작성
- 각 섹션은 최소 300자 이상
- 실제 사용 경험을 바탕으로 구체적으로 작성

상품 정보: ${JSON.stringify(productInfo, null, 2)}
키워드: ${keyword}`;

        console.log('GPT API 요청 준비:', { prompt });

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: "당신은 전문적인 블로그 작성자입니다. 상품 정보를 바탕으로 매력적인 블로그 포스팅을 작성해주세요. HTML 형식으로 작성하며, 각 상품의 이미지와 링크를 포함해주세요."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });

        console.log('GPT API 응답:', completion.choices[0].message);
        
        // GPT 응답에 배너 추가
        const gptContent = completion.choices[0].message.content;
        const banners = `
<!-- 갤럭시 S25 사전예약 배너 -->
<div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
  <h3 style="color: #346aff; margin-bottom: 15px;">🔥 갤럭시 S25 사전예약 진행중 🔥</h3>
  <a href="https://link.coupang.com/a/cukenB" target="_blank" rel="noopener noreferrer">
    <img src="https://image12.coupangcdn.com/image/affiliate/event/promotion/2025/05/13/0f8a98f20d6c00850193516821a3ad4c.png" alt="갤럭시 S25 사전예약" style="max-width:350px; margin-bottom:10px; border-radius: 4px;">
    <div style="font-size:14px; color:#666; margin-top:10px;">갤럭시 S25 사전예약 혜택 확인하기</div>
  </a>
</div>

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

// API 엔드포인트
app.post('/generate-post', async (req, res) => {
    console.log('새로운 요청 수신');
    
    try {
        const { keyword } = req.body;
        console.log('요청 데이터:', { keyword });
        
        if (!keyword) {
            console.log('키워드 누락');
            return res.status(400).json({
                success: false,
                error: '키워드를 입력해주세요.'
            });
        }

        console.log('쿠팡 상품 검색 시작');
        const products = await searchCoupangProducts(keyword);
        
        console.log('블로그 포스팅 생성 시작');
        const blogPost = await generateBlogPost(products, keyword);
        
        console.log('응답 전송');
        res.json({ 
            success: true, 
            blogPost: blogPost 
        });
    } catch (error) {
        console.error('전체 프로세스 에러:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || '서버 에러가 발생했습니다.'
        });
    }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`http://localhost:${PORT} 에서 웹 인터페이스를 확인할 수 있습니다.`);
}); 