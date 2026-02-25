# coalarm-node-next — Crypto Ticker Pipeline
암호화폐 거래소의 시세(ticker) 데이터를 실시간으로 수집하여 데이터베이스에 저장하는 Kafka 기반 Node.js 파이프라인입니다.
거래소 WebSocket 스트림을 구독하고, Kafka를 통해 안정적으로 TimescaleDB에 저장합니다.

## 👨‍💻 Developer
| jeonggu.kim<br />(김정현) |
|:---:|
| <a href="https://github.com/dev-jeonggu"> <img src="https://avatars.githubusercontent.com/dev-jeonggu" width=100px alt="_"/> </a> |
| <a href="https://github.com/dev-jeonggu">@dev-jeonggu</a> |

---

## 🛠️ Stack
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=Node.js&logoColor=white)
![Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?style=flat&logo=Apache%20Kafka&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_15-4169E1?style=flat&logo=PostgreSQL&logoColor=white)
![TimescaleDB](https://img.shields.io/badge/TimescaleDB-FDB515?style=flat&logo=TimescaleDB&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=Docker&logoColor=white)
![ccxt](https://img.shields.io/badge/ccxt-4.4-black?style=flat&logo=bitcoin&logoColor=white)

---

## ✨ 프로젝트 목적
- ccxt.pro WebSocket으로 **다중 거래소의 실시간 시세 스트림** 수집
- Kafka를 중간 레이어로 두어 **수집과 저장을 분리**, 유실 없는 파이프라인 구성
- **TimescaleDB 하이퍼테이블**을 활용한 시계열 데이터 효율적 저장
- **DLQ(Dead Letter Queue)** 패턴으로 파싱/저장 실패 메시지 안전하게 격리

---

## 🏗️ 아키텍처

```
거래소 (Binance 등)
      │  WebSocket
      ▼
 [Producer]  ──→  Kafka (ticker topic)  ──→  [Consumer]  ──→  TimescaleDB
                        │
                        └──→  (실패 시) Kafka (ticker.dlq)
```

- **Producer**: ccxt.pro WebSocket으로 거래소 시세를 구독하고 Kafka에 발행
- **Consumer**: Kafka에서 메시지를 배치로 읽어 TimescaleDB에 저장
- **DLQ**: 파싱/저장 실패 메시지는 `ticker.dlq` 토픽으로 이동

---

## 📁 프로젝트 구조

```
.
├── docker-compose.yml       # 전체 스택 실행
├── init.sql                 # DB 초기화 스크립트 (하이퍼테이블 포함)
├── v4/                      # Kafka 기반 메인 구현체
│   ├── EntryProducer.js     # Producer 진입점
│   ├── EntryConsumer.js     # Consumer 진입점
│   ├── Dockerfile
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

---

## ⚙️ How to Run

### 1. Docker로 전체 스택 실행

```bash
docker-compose up --build
```

> PostgreSQL(TimescaleDB), Kafka, Producer, Consumer가 한 번에 실행됩니다.

| 서비스 | 포트 |
|--------|------|
| TimescaleDB (PostgreSQL) | 5432 |
| Kafka | 9092 |

```bash
# 백그라운드 실행
docker-compose up --build -d

# 로그 확인
docker-compose logs -f producer
docker-compose logs -f consumer

# 컨테이너만 종료
docker-compose down

# 컨테이너 + DB 볼륨까지 삭제
docker-compose down -v
```

### 2. 로컬 직접 실행

**인프라 실행**

```bash
# TimescaleDB
docker run -d \
  --name coalarm-postgres \
  -e POSTGRES_USER=coalarm \
  -e POSTGRES_PASSWORD=coalarm \
  -e POSTGRES_DB=coalarm \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg15

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

**DB 테이블 생성**

```bash
docker exec -i coalarm-postgres psql -U coalarm -d coalarm < init.sql
```

**의존성 설치 및 실행**

```bash
cd v4
npm install

# 터미널 1 - Producer
node EntryProducer.js --type=ticker --exchangeId=binance --chunkSize=50

# 터미널 2 - Consumer
node EntryConsumer.js --type=ticker --exchangeId=binance
```

---

## 🔧 CLI 옵션

### Producer

```bash
node EntryProducer.js [옵션]
```

| 옵션 | 필수 | 설명 |
|------|:----:|------|
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
|------|:----:|------|
| `--type` | ✅ | 워커 타입 (`ticker`) |
| `--exchangeId` | | 거래소 ID |

---

## 🌐 환경 변수 (`v4/.env`)

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

## 🗄️ DB 스키마

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

-- TimescaleDB 하이퍼테이블로 변환
SELECT create_hypertable('tickers', 'timestamp');
```
