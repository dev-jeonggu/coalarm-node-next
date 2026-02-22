# coalarm-node-next

암호화폐 거래소의 시세(ticker) 데이터를 실시간으로 수집하여 데이터베이스에 저장하는 파이프라인입니다.

## 아키텍처

```
거래소 (Binance 등)
      │
      ▼
 [Producer]  ──→  Kafka (ticker topic)  ──→  [Consumer]  ──→  PostgreSQL
```

- **Producer**: ccxt.pro WebSocket으로 거래소 시세를 구독하고 Kafka에 발행
- **Consumer**: Kafka에서 메시지를 배치로 읽어 PostgreSQL에 저장
- **DLQ**: 파싱/저장 실패 메시지는 `ticker.dlq` 토픽으로 이동

## 빠른 시작 (Docker)

```bash
docker-compose up --build
```

전체 스택(PostgreSQL, Kafka, Producer, Consumer)이 한 번에 실행됩니다.

### 백그라운드 실행

```bash
docker-compose up --build -d
```

### 로그 확인

```bash
docker-compose logs -f producer
docker-compose logs -f consumer
```

### 종료

```bash
# 컨테이너만 종료
docker-compose down

# 컨테이너 + DB 볼륨까지 삭제
docker-compose down -v
```

---

## 로컬 직접 실행 (v4 기준)

### 1. 인프라 실행

```bash
# PostgreSQL
docker run -d \
  --name coalarm-postgres \
  -e POSTGRES_USER=coalarm \
  -e POSTGRES_PASSWORD=coalarm \
  -e POSTGRES_DB=coalarm \
  -p 5432:5432 \
  postgres:15

# Kafka
docker run -d \
  --name coalarm-kafka \
  -p 9092:9092 \
  -e KAFKA_NODE_ID=1 \
  -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
  -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=true \
  apache/kafka:latest
```

### 2. DB 테이블 생성

```bash
docker exec -i coalarm-postgres psql -U coalarm -d coalarm < init.sql
```

### 3. 의존성 설치 및 실행

```bash
cd v4
npm install

# 터미널 1 - Producer
node EntryProducer.js --type=ticker --exchangeId=binance --chunkSize=50

# 터미널 2 - Consumer
node EntryConsumer.js --type=ticker --exchangeId=binance
```

---

## 환경 변수 (v4/.env)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DB_HOST` | `localhost` | PostgreSQL 호스트 |
| `DB_PORT` | `5432` | PostgreSQL 포트 |
| `DB_NAME` | `coalarm` | 데이터베이스 이름 |
| `DB_USER` | `coalarm` | DB 사용자 |
| `DB_PASSWORD` | `coalarm` | DB 비밀번호 |
| `DB_BATCH_SIZE` | `50` | DB 배치 저장 크기 |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka 브로커 주소 |
| `KAFKA_CLIENT_ID` | `coalarm` | Kafka 클라이언트 ID |
| `KAFKA_GROUP_ID` | `coalarm-consumer-group` | Consumer 그룹 ID |
| `KAFKA_TOPIC` | `ticker` | 시세 데이터 토픽 |
| `KAFKA_DLQ_TOPIC` | `ticker.dlq` | Dead Letter Queue 토픽 |

---

## CLI 옵션

### Producer

```bash
node EntryProducer.js [옵션]
```

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--type` | ✅ | 워커 타입 (`ticker`) |
| `--exchangeId` | | 거래소 ID (`binance`, `upbit` 등) |
| `--chunkSize` | | 심볼 청크 크기 (기본값 없음, 필수 설정 권장) |
| `--debug` | | 목업 모드 활성화 (`true`) |
| `--tps` | | 목업 모드 초당 처리량 |
| `--symbolCount` | | 목업 모드 심볼 수 |

### Consumer

```bash
node EntryConsumer.js [옵션]
```

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--type` | ✅ | 워커 타입 (`ticker`) |
| `--exchangeId` | | 거래소 ID |

---

## 프로젝트 구조

```
.
├── docker-compose.yml       # 전체 스택 실행
├── init.sql                 # DB 초기화 스크립트
├── v4/                      # Kafka 기반 메인 구현체
│   ├── EntryProducer.js     # Producer 진입점
│   ├── EntryConsumer.js     # Consumer 진입점
│   ├── utils/
│   │   ├── KafkaProducer.js # Kafka 발행 클라이언트
│   │   ├── KafkaConsumer.js # Kafka 소비 클라이언트 (DLQ 포함)
│   │   ├── db.js            # PostgreSQL 연결 풀
│   │   ├── query.js         # DB 쿼리 (배치 INSERT)
│   │   ├── logger.js        # Winston 로거
│   │   └── args.js          # CLI 인자 파싱
│   └── core/
│       ├── producer/        # Producer 워커
│       ├── consumer/        # Consumer 워커
│       ├── strategy/        # 거래소/DB 처리 전략
│       └── mock/            # 목업 테스트용 구현체
├── v3/                      # RabbitMQ 기반 구현체 (레거시)
├── v2/                      # 이전 버전
└── monitor/                 # Prometheus 메트릭 수집 서버
```

## DB 스키마

```sql
CREATE TABLE tickers (
  timestamp      TIMESTAMPTZ  NOT NULL,
  exchange       VARCHAR(50)  NOT NULL,
  base_symbol    VARCHAR(20)  NOT NULL,
  quote_symbol   VARCHAR(20)  NOT NULL,
  open           NUMERIC,
  high           NUMERIC,
  low            NUMERIC,
  close          NUMERIC,
  last           NUMERIC,
  previous_close NUMERIC,
  change         NUMERIC,
  percentage     NUMERIC,
  base_volume    NUMERIC,
  quote_volume   NUMERIC,
  PRIMARY KEY (timestamp, exchange, base_symbol, quote_symbol)
);
```
