# 🛒 쿠팡 블로그 포스팅 생성기

> 쿠팡 파트너스 API와 GPT를 활용하여 SEO 최적화된 블로그 포스팅을 자동으로 생성하는 프로그램입니다.

## ✨ 주요 기능

- 🔍 **쿠팡 상품 검색**: 키워드로 쿠팡 상품 자동 검색
- 🤖 **GPT 블로그 생성**: AI로 SEO 최적화된 고품질 리뷰 생성
- 📝 **워드프레스 연동**: 생성된 포스팅을 워드프레스에 자동 업로드
- 🎨 **HTML 스타일링**: 깔끔한 디자인과 CTA 요소 포함
- 📊 **SEO 최적화**: H2/H3 구조화, 키워드 최적화, 감정적 제목

## 🚀 빠른 시작

### 1. 설치

```bash
# 저장소 클론
git clone https://github.com/your-repo/coupang-generator2.git
cd coupang-generator2

# 의존성 설치
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 정보를 입력하세요:

```env
# 필수 설정
COUPANG_ACCESS_KEY=your_coupang_access_key
COUPANG_SECRET_KEY=your_coupang_secret_key
OPENAI_API_KEY=your_openai_api_key

# 선택 설정 (워드프레스 자동 포스팅)
WP_URL=https://your-wordpress-site.com/wp-json/wp/v2
WP_USER=your_wordpress_username
WP_PASSWORD=your_wordpress_app_password

# 선택 설정 (커스텀 프롬프트)
BLOG_POST_PROMPT="커스텀 프롬프트 내용..."
```

### 3. 프롬프트 설정 (선택사항)

프롬프트를 커스터마이징하는 3가지 방법:

#### 방법 1: 별도 파일로 관리 (추천 ⭐)
```bash
# 프롬프트 파일 생성
cp prompts/blog-post-prompt.example.txt prompts/blog-post-prompt.txt

# 파일 편집하여 원하는 프롬프트 작성
vim prompts/blog-post-prompt.txt
```

#### 방법 2: .env 파일에 저장
```env
BLOG_POST_PROMPT="너는 전문 리뷰어야. 상품정보: {productInfo}, 키워드: {keyword}"
```

#### 방법 3: 우선순위 시스템
1. **`.env의 BLOG_POST_PROMPT`** (최우선)
2. **`prompts/blog-post-prompt.txt`** (두 번째)
3. **기본 프롬프트** (마지막)

> 📝 **템플릿 변수**: `{keyword}`, `{productInfo}` 사용 가능
> 🔒 **보안**: `prompts/` 폴더는 `.gitignore`에 의해 Git에서 제외됨

### 4. 실행

```bash
npm start
```

서버가 시작되면 `http://localhost:3000`에서 웹 인터페이스를 확인할 수 있습니다.

## 📖 API 사용법

### 1. 블로그 포스팅 생성

```bash
curl -X POST http://localhost:3000/generate-post \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "에어팟 프로",
    "autoPostToWordPress": false
  }'
```

**응답 예시:**
```json
{
  "success": true,
  "blogPost": "<article><h1>에어팟 프로 후기 - 솔직하게 말해보는 장단점과 구매 가이드</h1>...</article>",
  "wordpress": null
}
```

### 2. 워드프레스 수동 포스팅

```bash
curl -X POST http://localhost:3000/post-to-wordpress \
  -H "Content-Type: application/json" \
  -d '{
    "content": "<html>포스팅 내용...</html>",
    "keyword": "에어팟 프로"
  }'
```

## 🎯 생성되는 포스팅 구조

### 📝 포스팅 포함 요소
- **감정적 제목**: 키워드 + 감정 자극 문구
- **3줄 요약 도입부**: 사용자 고민 공감 및 해결책 제시
- **상품 정보 카드**: 이미지, 가격, 구매 링크 포함
- **체계적 H2/H3 구조**: SEO 최적화된 제목 구조
- **중간 CTA**: 구매 유도 요소
- **솔직한 후기**: 장점, 단점, 총평
- **관련 글 링크**: 내부 링크로 SEO 강화

### 🎨 스타일 특징
- 📱 반응형 디자인
- 🎯 브랜드 컬러 (#346aff) 적용
- 📊 가독성 최적화
- 🛒 구매 유도 CTA 요소

## 🛠️ 개발 도구

### 코드 품질 관리
```bash
# 린트 검사
npm run lint

# 자동 수정
npm run lint:fix

# 코드 포맷팅
npm run format
```

### VSCode 설정
프로젝트에는 VSCode 설정이 포함되어 있어 저장 시 자동으로 린트와 포맷팅이 적용됩니다.

## 📋 요구사항

### API 키 발급
1. **쿠팡 파트너스**: [쿠팡 파트너스 센터](https://partners.coupang.com/)에서 API 키 발급
2. **OpenAI**: [OpenAI Platform](https://platform.openai.com/)에서 API 키 발급
3. **워드프레스** (선택): 워드프레스 애플리케이션 패스워드 생성

### 시스템 요구사항
- Node.js 18.0.0 이상
- NPM 8.0.0 이상

## 🔧 설정 옵션

### 포스팅 설정
- `max_tokens`: GPT 응답 길이 (기본값: 3500)
- `temperature`: 창의성 수준 (기본값: 0.7)
- `model`: 사용할 GPT 모델 (기본값: gpt-4.1)

### 프롬프트 커스터마이징
- **파일 방식**: `prompts/blog-post-prompt.txt`
- **환경변수 방식**: `.env`의 `BLOG_POST_PROMPT`
- **템플릿 변수**: `{keyword}`, `{productInfo}` 자동 치환
- **우선순위**: .env → 파일 → 기본값

### 워드프레스 설정
- 포스팅 상태: `draft` 또는 `publish`
- 카테고리 자동 분류
- H1 태그 자동 제거 (제목으로 분리)

## ⚠️ 주의사항

1. **API 키 보안**: `.env` 파일을 절대 공개 저장소에 업로드하지 마세요
2. **프롬프트 보안**: `prompts/` 폴더는 자동으로 Git에서 제외됩니다
3. **이용약관 준수**: 쿠팡 파트너스 API 이용약관을 반드시 준수하세요
4. **저작권**: 생성된 콘텐츠의 저작권과 책임은 사용자에게 있습니다
5. **API 제한**: OpenAI API 사용량과 쿠팡 API 호출 제한을 확인하세요
6. **프롬프트 백업**: 중요한 프롬프트는 별도로 백업하세요

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 🆘 문제 해결

### 자주 발생하는 문제

**Q: 쿠팡 API 호출이 실패해요**
- A: API 키가 올바른지 확인하고, 쿠팡 파트너스 승인 상태를 확인해주세요.

**Q: GPT 응답이 너무 짧아요**
- A: `max_tokens` 값을 늘려보세요 (현재 3500).

**Q: 워드프레스 포스팅이 안 돼요**
- A: 워드프레스 REST API가 활성화되어 있고, 애플리케이션 패스워드가 올바른지 확인해주세요.

**Q: 커스텀 프롬프트가 적용되지 않아요**
- A: 우선순위를 확인하세요: .env → prompts/blog-post-prompt.txt → 기본값

**Q: 프롬프트 파일을 어떻게 만드나요?**
- A: `cp prompts/blog-post-prompt.example.txt prompts/blog-post-prompt.txt` 실행 후 편집하세요.

**Q: 프롬프트에서 템플릿 변수가 작동하지 않아요**
- A: `{keyword}`와 `{productInfo}` 형식을 정확히 사용하고 있는지 확인해주세요.

---

<div align="center">

**🌟 이 프로젝트가 도움이 되셨다면 Star를 눌러주세요! 🌟**

</div>
