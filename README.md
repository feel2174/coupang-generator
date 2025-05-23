# 쿠팡 블로그 포스팅 생성기

쿠팡 파트너스 API와 GPT를 활용하여 자동으로 블로그 포스팅을 생성하는 프로그램입니다.

## 설치 방법

1. 필요한 패키지 설치:
```bash
npm install
```

2. `.env` 파일 생성 및 API 키 설정:
```
COUPANG_ACCESS_KEY=your_coupang_access_key
COUPANG_SECRET_KEY=your_coupang_secret_key
OPENAI_API_KEY=your_openai_api_key
```

## 실행 방법

```bash
npm start
```

## API 사용 방법

POST 요청을 `/generate-post` 엔드포인트로 보내면 됩니다.

예시:
```bash
curl -X POST http://localhost:3000/generate-post \
-H "Content-Type: application/json" \
-d '{"keyword": "노트북"}'
```

응답은 다음과 같은 형식으로 반환됩니다:
```json
{
  "success": true,
  "blogPost": "<html>생성된 블로그 포스팅 내용...</html>"
}
```

## 주의사항

- 쿠팡 파트너스 API 키와 OpenAI API 키가 필요합니다.
- API 키는 반드시 `.env` 파일에 안전하게 보관해야 합니다.
- 쿠팡 파트너스 API 사용 시 쿠팡의 이용약관을 준수해야 합니다. #   c o u p a n g - g e n e r a t o r  
 