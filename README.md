# 🌱 GLEC API Dev2

> GLEC Framework 기반 물류 배출량 계산 B2B SaaS API 플랫폼

## 🚀 빠른 시작

```bash
# 프로젝트 클론
git clone https://github.com/DEOKHOKANG/glec-api-dev2.git
cd glec-api-dev2

# 환경 변수 설정
cp .env.example .env
# .env 파일에서 필요한 값들 설정

# 모든 의존성 설치
npm run install:all

# Docker로 실행
docker-compose up -d

# 또는 로컬 개발
npm run dev
```

## 📁 프로젝트 구조

```
glec-api-dev2/
├── api-gateway/          # Express.js API 게이트웨이
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── utils/
│   └── tests/
├── frontend/
│   └── dashboard/        # React + Next.js 대시보드
├── shared/              # 공통 타입/유틸리티
├── scripts/             # 개발/배포 스크립트
└── docs/               # 프로젝트 문서
```

## 🔗 주요 링크

- **API 문서**: http://localhost:3000/docs
- **대시보드**: http://localhost:3001  
- **Health Check**: http://localhost:3000/health
- **GitHub**: https://github.com/DEOKHOKANG/glec-api-dev2

## 🧪 개발 가이드

### API Gateway 개발
```bash
cd api-gateway
npm install
npm run dev
```

### 테스트 실행
```bash
# API 테스트
npm run test:gateway

# 린팅
cd api-gateway && npm run lint
```

## 🐳 Docker 개발 환경

```bash
# 모든 서비스 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 서비스 중지
docker-compose down
```

## 📊 개발 현황

- ✅ 프로젝트 구조 설계
- ✅ API Gateway 기본 구현
- 🚧 인증 시스템 구현 중
- ⏳ 배출량 계산 엔진 구현 예정
- ⏳ 사용자 대시보드 구현 예정

## 📚 기술 스택

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Frontend**: React, Next.js 14, Tailwind CSS
- **DevOps**: Docker, GitHub Actions
- **Testing**: Jest, Supertest

## 🤝 기여 가이드라인

1. 이 저장소를 포크합니다
2. 새로운 기능 브랜치를 생성합니다 (`git checkout -b feature/AmazingFeature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/AmazingFeature`)
5. Pull Request를 생성합니다

## 📄 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

**📈 MCP 통합 개발환경으로 구축됨**  
*GitHub, Supabase, Postman, Task Master 완전 연동*