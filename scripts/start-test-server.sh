#!/bin/bash

# GLEC API Dev2 테스트 실행 스크립트
echo "🚀 GLEC API Dev2 테스트 시작..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수 정의
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. 프로젝트 디렉토리 확인
print_step "프로젝트 디렉토리 확인 중..."
if [ ! -d "api-gateway" ]; then
    print_error "api-gateway 디렉토리를 찾을 수 없습니다."
    echo "현재 디렉토리가 glec-api-dev2 루트인지 확인해주세요."
    exit 1
fi
print_success "프로젝트 디렉토리 확인 완료"

# 2. Node.js 및 npm 확인
print_step "Node.js 및 npm 확인 중..."
if ! command -v node &> /dev/null; then
    print_error "Node.js가 설치되지 않았습니다."
    echo "https://nodejs.org에서 Node.js를 설치해주세요."
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js 버전: $NODE_VERSION"

# 3. 환경 변수 파일 확인
print_step "환경 변수 파일 확인 중..."
cd api-gateway

if [ ! -f ".env" ]; then
    print_warning ".env 파일이 없습니다. .env.example에서 복사합니다..."
    if [ -f "../.env.example" ]; then
        cp ../.env.example .env
        print_success ".env 파일 생성 완료"
        print_warning "⚠️  .env 파일을 수정하여 올바른 환경 변수를 설정해주세요:"
        echo "   - SUPABASE_URL"
        echo "   - SUPABASE_ANON_KEY"
        echo "   - REDIS_HOST (optional, localhost 기본값)"
    else
        print_error ".env.example 파일을 찾을 수 없습니다."
        exit 1
    fi
else
    print_success ".env 파일 확인 완료"
fi

# 4. 의존성 설치
print_step "의존성 설치 중..."
npm install
if [ $? -eq 0 ]; then
    print_success "의존성 설치 완료"
else
    print_error "의존성 설치 실패"
    exit 1
fi

# 5. TypeScript 컴파일 확인
print_step "TypeScript 컴파일 확인 중..."
npm run build
if [ $? -eq 0 ]; then
    print_success "TypeScript 컴파일 완료"
else
    print_error "TypeScript 컴파일 실패"
    print_warning "개발 모드로 실행을 시도합니다..."
fi

# 6. 서버 시작
print_step "개발 서버 시작 중..."
echo "🌐 서버가 http://localhost:3000 에서 실행됩니다"
echo "🛑 서버를 중지하려면 Ctrl+C를 누르세요"
echo ""
echo "=== 서버 로그 ==="

# 개발 서버 시작 (백그라운드에서)
npm run dev &
SERVER_PID=$!

# 서버 시작 대기
print_step "서버 시작 대기 중... (10초)"
sleep 10

# 서버 상태 확인
print_step "서버 상태 확인 중..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    print_success "서버가 성공적으로 시작되었습니다!"
    echo ""
    echo "🧪 테스트 실행을 위해 새 터미널에서 다음 명령어를 실행하세요:"
    echo "   cd api-gateway && npm run test:api"
    echo ""
    echo "📨 또는 Postman에서 다음 컬렉션을 실행하세요:"
    echo "   - Collection: GLEC Emissions API - Auto Generated"
    echo "   - Environment: GLEC API Dev2 - Development"
    echo ""
    echo "🌐 API 문서: http://localhost:3000/api/v1"
    echo "🏥 Health Check: http://localhost:3000/health"
    echo "📊 Rate Limits: http://localhost:3000/api/v1/rate-limits"
    
    # 서버를 포그라운드로 가져와서 로그 표시
    wait $SERVER_PID
else
    print_error "서버 시작 실패 (HTTP Status: $HTTP_STATUS)"
    print_warning "가능한 원인:"
    echo "   - 포트 3000이 이미 사용 중"
    echo "   - 환경 변수 설정 오류"
    echo "   - Supabase 연결 실패"
    echo "   - Redis 연결 실패 (선택사항)"
    
    # 백그라운드 프로세스 종료
    kill $SERVER_PID 2>/dev/null
    exit 1
fi