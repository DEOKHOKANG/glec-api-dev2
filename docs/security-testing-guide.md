# 🧪 GLEC API Dev2 - 보안 & Rate Limiting 테스트 가이드

## 📊 테스트 개요

이 가이드는 구현된 보안 기능과 Rate Limiting을 종합적으로 테스트하는 방법을 제공합니다.

## 🚀 로컬 서버 시작

테스트 실행 전에 로컬 개발 서버를 시작해야 합니다:

```bash
# 프로젝트 디렉토리로 이동
cd api-gateway

# 의존성 설치
npm install

# 환경 변수 설정
cp ../.env.example .env
# .env 파일에서 필요한 값들 설정

# 개발 서버 시작
npm run dev
```

서버가 성공적으로 시작되면 다음과 같은 메시지가 출력됩니다:
```
🚀 GLEC API Gateway running on port 3000
🛡️  Security: Rate limiting, input sanitization, security headers enabled
⚡ GLEC Framework v3.1 Ready with enhanced security!
```

## 🧪 테스트 케이스

### 1. Security Features Health Check
**엔드포인트**: `GET /health`
**목적**: 모든 보안 기능이 활성화되어 있는지 확인

**예상 응답**:
```json
{
  "status": "OK",
  "timestamp": "2025-05-25T15:20:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected",
  "services": {
    "supabase": "up",
    "redis": "up",
    "api": "up"
  },
  "security": {
    "rateLimiting": "enabled",
    "securityHeaders": "enabled",
    "inputSanitization": "enabled",
    "apiKeyValidation": "enabled"
  }
}
```

### 2. Rate Limits Information
**엔드포인트**: `GET /api/v1/rate-limits`
**목적**: Rate Limiting 설정 확인

**예상 응답**:
```json
{
  "rateLimits": {
    "basic": {
      "windowMs": 900000,
      "max": 100,
      "description": "Basic tier: 100 requests per 15 minutes"
    },
    "premium": {
      "windowMs": 900000,
      "max": 500,
      "description": "Premium tier: 500 requests per 15 minutes"
    },
    "enterprise": {
      "windowMs": 900000,
      "max": 2000,
      "description": "Enterprise tier: 2000 requests per 15 minutes"
    }
  },
  "currentTier": "ip-based"
}
```

### 3. API Key Format Validation Test
**엔드포인트**: `GET /api/v1` (with invalid API key)
**헤더**: `X-API-Key: invalid-key-format`
**목적**: API Key 형식 검증 확인

**예상 응답**:
```json
{
  "error": "Invalid API key format",
  "message": "API key must follow the format: glec_{live|test}_{32_characters}"
}
```

### 4. SQL Injection Prevention Test
**엔드포인트**: `GET /api/v1/emissions-factors/search?q='; DROP TABLE users; --`
**목적**: SQL Injection 방지 확인

**예상 동작**: 
- 위험한 문자 제거 또는 안전한 응답 반환
- 데이터베이스 에러 정보 노출 없음

### 5. Rate Limiting Test
**엔드포인트**: `GET /api/v1` (반복 요청)
**목적**: Rate Limiting 동작 확인

**테스트 방법**:
1. Postman Collection Runner 사용
2. 동일 요청을 50회 이상 반복
3. 429 응답 코드 확인

**예상 응답 (Rate Limit 초과 시)**:
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests from this IP, please try again later.",
  "retryAfter": 900
}
```

## 📈 보안 헤더 확인

모든 응답에서 다음 보안 헤더들이 포함되어야 합니다:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 49
X-RateLimit-Reset: 1732550400
```

## 🔍 테스트 결과 확인 포인트

### ✅ 통과 기준
1. **Health Check**: 모든 보안 기능이 'enabled' 상태
2. **Rate Limiting**: 설정된 제한에 따라 429 응답 반환
3. **API Key Validation**: 잘못된 형식의 키 거부
4. **SQL Injection**: 위험한 쿼리 무력화
5. **Security Headers**: 모든 보안 헤더 존재
6. **Input Sanitization**: 특수 문자 제거/이스케이프

### ❌ 실패 시나리오
1. 보안 기능이 'disabled' 상태
2. Rate Limiting이 동작하지 않음
3. 잘못된 API Key가 허용됨
4. SQL 에러 메시지 노출
5. 보안 헤더 누락
6. XSS/Injection 공격 성공

## 🛠️ 문제 해결

### Redis 연결 오류
```bash
# Redis 서버 시작 (Docker)
docker run -d -p 6379:6379 redis:7-alpine

# 또는 로컬 Redis 설치 후 시작
redis-server
```

### Supabase 연결 오류
1. `.env` 파일에서 `SUPABASE_URL`과 `SUPABASE_ANON_KEY` 확인
2. Supabase 프로젝트 상태 확인
3. 네트워크 연결 확인

### Port 3000 이미 사용 중
```bash
# 다른 포트로 실행
PORT=3001 npm run dev
```

## 📊 성능 벤치마크

### 응답 시간 목표
- Health Check: < 100ms
- Rate Limits Info: < 50ms
- API Documentation: < 200ms
- Emissions Factors API: < 300ms

### Rate Limiting 정확도
- IP 기반: 15분에 50개 요청
- API Key 기본: 15분에 100개 요청
- Heavy Operations: 1분에 10개 요청

## 📝 테스트 리포트 예시

```
🧪 GLEC API Dev2 보안 테스트 결과

✅ Health Check: PASS (응답시간: 45ms)
✅ Security Headers: PASS (모든 헤더 존재)
✅ Rate Limiting: PASS (50회 후 429 응답)
✅ API Key Validation: PASS (잘못된 형식 거부)
✅ SQL Injection Prevention: PASS (안전한 응답)
✅ Input Sanitization: PASS (특수문자 제거)

종합 점수: 100% (6/6 통과)
보안 등급: A+
```

## 🚀 다음 단계

테스트 완료 후:
1. 발견된 이슈 수정
2. 추가 보안 테스트 케이스 작성
3. CI/CD 파이프라인에 보안 테스트 통합
4. 성능 모니터링 설정

---

**마지막 업데이트**: 2025-05-25
**테스트 버전**: v1.0.0