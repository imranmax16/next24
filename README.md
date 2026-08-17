# Nabız — Gerçek Zamanlı Türkçe Haber Merkezi

Nabız, yetkili makine-okunur haber kaynaklarını düşük gecikmeyle izleyen; haberleri normalize eden, kümelendiren, doğrulayan, profesyonel Türkçe gönderiye dönüştüren ve editoryal kurallardan sonra X'e yayımlayan modüler bir newsroom platformudur. Bu depo ilk çalışan kilometre taşını içerir ve varsayılan olarak **demo + dry-run + hibrit** modda güvenle açılır.

## Mimari

```text
RSS / lisanslı API / stream / fixture
  → bağımsız ingestion workers
  → Redis + BullMQ (backpressure, retries, DLQ)
  → normalization → deterministic dedupe → story clustering
  → importance + verification → structured AI writer
  → weighted X validation → deterministic decision engine
  → review queue / idempotent X publisher
  → PostgreSQL audit trail + realtime dashboard
```

`packages/news-core` deterministik kararları, `source-adapters` edinimi, `ai` sağlayıcı sözleşmesini, `x-publisher` genel `PublisherAdapter` sözleşmesini ve X uygulamasını içerir. LLM hiçbir zaman X'i doğrudan çağıramaz. `apps/worker` sürekli çalışan BullMQ tüketicisidir. Dashboard gerçek operasyon görünümünü ve editör etkileşimlerini demo verisiyle sunar.

## Hızlı başlangıç

Gerekenler: Node.js 22+, pnpm 11+; tam yığın için Docker ve Docker Compose.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Dashboard `http://localhost:3000` adresinde açılır. Ücretli kaynak, AI veya X anahtarı olmadan `DEMO_MODE=true` ile çalışır.

Tam yerel yığın:

```bash
cp .env.example .env
docker compose up --build
```

PostgreSQL migrasyonu ilk boş veritabanında otomatik uygulanır. Mevcut bir veritabanında `packages/database/migrations/0001_initial.sql` bir migration aracı veya `psql` ile kontrollü uygulanmalıdır.

## Demo ve test

```bash
pnpm demo
pnpm test
pnpm test:integration
pnpm build
```

Demo hattı fixture → normalize → sınıflandır → karar → Türkçe metin → X karakter kontrolü → dry-run yayın akışını çalıştırır. X'e istek göndermez; yapılandırılmış logda `WOULD_PUBLISH` üretir. Fixture'lar Reuters benzeri son dakika, resmi deprem, tekrar, çelişki, düzeltme, X hatası ve kaynak kesintisi senaryoları eklenebilecek şekilde `tests/fixtures` altında tutulur.

## Kaynak yapılandırması

`packages/source-adapters/src/registry.ts` kaynak kayıtlarının başlangıç kataloğudur. Her kaynak ayrı etkinleştirilir; öncelik, güven, dil, kategori ve poll süresi değiştirilebilir. `RssAdapter` yalnızca sağlayıcı tarafından yayımlanmış/yetkilendirilmiş RSS/Atom URL'leri içindir. ETag ve Last-Modified değerleri üretim Redis cache'inde saklanarak adaptöre request header olarak eklenmelidir. Hata durumunda BullMQ üstel backoff uygular.

Reuters, AP, AFP ve lisans isteyen diğer girdiler anahtar olmadan `requires_license`; bir URL veya mapping eksiğinde `requires_configuration` verir. Reuters Connect/API sözleşmenize göre `LicensedApiAdapter` türetilmeli; `REUTERS_API_KEY` ve `REUTERS_FEED_URL` sadece worker ortamına verilmelidir. Anadolu için kurumun sağladığı resmi/lisanslı feed URL'si `ANADOLU_FEED_URL` üzerinden yapılandırılmalıdır. Anti-bot, paywall veya kimlik doğrulama atlatan scraping bu tasarımın parçası değildir.

Yeni kaynak eklemek için:

1. `NewsSourceAdapter` arayüzünü uygulayın.
2. Sağlayıcının yetkili formatını `RawNewsItem`e dönüştürün.
3. Timeout, conditional request, rate limit ve health check ekleyin.
4. Registry kaydını varsayılan olarak kapalı ekleyin.
5. Parser/normalizasyon fixture testi yazın.
6. Lisans ve atıf gereksinimini kaynak metadata'sında belgeleyin.

## AI sağlayıcısı ve güvenlik sınırı

`AIProvider` iki kontrollü operasyon sunar: şemalı sınıflandırma ve sadece doğrulanmış iddialardan Türkçe metin. Model yanıtı Zod ile doğrulanır. `DeterministicDemoProvider` anahtarsız başlangıç içindir. OpenAI/Gemini adaptöründe yalnızca yapılandırılmış kaynak gerçekleri gönderilmeli; sayı, isim, tarih, olumsuzluk, belirsizlik ve atıf sonradan deterministik doğrulanmalıdır. AI sonucu cache'lenmeli; URL/hash ve küme elemesinden geçen adaylar dışında model çağrısı yapılmamalıdır.

## X Developer kurulumu

1. X Developer portalında uygulama ve hesabınızın planına uygun yazma izni oluşturun.
2. Güncel, resmi kullanıcı kimlik doğrulama yöntemini seçin (OAuth 2.0 user context veya hesabınıza uygun OAuth 1.0a).
3. Yalnızca seçilen yöntem için gereken değişkenleri worker secret store'una koyun.
4. `DRY_RUN=true` ile uçtan uca test edin; sonra staging hesabında sınırlı yayın deneyin.
5. XPublisher içindeki gerçek API çağrısını resmi SDK/endpoint ile tamamlayıp idempotency kaydını publish isteğinden önce PostgreSQL'de kilitleyin.

Hesap profili otomatik olduğunu açıkça belirtmeli, sorumlu işletmeci hesabına bağlanmalı ve güncel X otomasyon/etiketleme kuralları düzenli gözden geçirilmelidir. İnsan davranışı taklit edilmez. Kaynak makaleler kopyalanmaz; yalnızca özgün kısa olgusal özet ve gereken atıf yayımlanır.

Canlı yayın OAuth 1.0a user-context ile resmi `POST https://api.x.com/2/tweets` endpoint'ini kullanır. `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` yalnızca server/worker ortamına verilir; `X_BEARER_TOKEN` okuma operasyonları için saklanabilir fakat gönderi oluşturmakta kullanılmaz. `AUTO_PUBLISH_X=false` otomatik worker yayınını kapatır; editörün “X'te Yayımla” düğmesi bundan bağımsızdır. `DRY_RUN=true` hem manuel hem otomatik akışta ağ isteğini engeller.

Supabase kullanırken `DATABASE_URL` değerini Supabase PostgreSQL bağlantı URI'si yapın ve `0002_x_publications.sql` migrasyonunu uygulayın. Canlı yayında her deneme önce aynı idempotency key, canonical kaynak URL'si veya başlık fingerprint'i için son `DUPLICATE_WINDOW_HOURS` aralığını sorgular. Başarıda X ID/URL, zaman, kaynak URL, başlık ve durum; hatada hata metni ve işlem logu kaydedilir. 429 ve 5xx yanıtları üstel/rate-limit-aware backoff ile tekrar denenir.

## Editoryal modlar

- `automatic`: eşikleri ve risk kurallarını geçen içerik otomatik yayımlanır.
- `hybrid` (varsayılan): yüksek güvenli/düşük riskli içerik otomatik; yüksek risk veya belirsizlik editör kuyruğuna gider.
- `manual`: her gönderi onay ister.

`FAST`, A-tier wire veya resmi doğrudan açıklama için; `CONFIRM`, en az iki bağımsız destek için; `MANUAL`, ölüm/suikast/terör/nükleer/seçim/darbe/can kaybı ve benzeri yüksek risk için kullanılır. Claim'in sahibi görünür metinde korunur. Sosyal medya söylentisi tek başına yayımlanmaz.

PAUSE düğmesi yalnızca publication tüketimini durdurur; alım, işleme ve aday saklama devam eder. Burst control Redis tabanlı token bucket, cluster update cooldown ve önem önceliğiyle uygulanmalıdır. Retry öncesi `idempotency_key` ve varsa X post ID kontrol edilir.

## Veritabanı ve denetim izi

Migration; sources, news_items, story_clusters, claims, candidates, published posts, corrections, health, logs, rules, settings ve RBAC users tablolarını ve kritik indeksleri kurar. Ham payload yalnızca sözleşme/hukuk izin veriyorsa ve gerekli saklama süresi boyunca tutulmalıdır. Secret değerleri veritabanında değil secret manager'da; `source_credentials_metadata` sadece “configured/rotated” bilgisini taşır.

Her olay correlation ID ile `source_received`, `normalized`, `cluster_matched`, `verified`, `post_generated`, `x_publish_started`, `x_publish_success` olarak loglanır. Ölçülen zamanlar `t_source_published`, `t_detected`, `t_normalized`, `t_verified`, `t_generated`, `t_publish_requested`, `t_x_confirmed` olup discovery, processing ve end-to-end gecikmeleri bunlardan hesaplanır.

## Dashboard, kimlik ve realtime

Demo dashboard; genel görünüm, canlı akış, latency, kaynak sağlığı, kuyruklar, inceleme ve kill switch'i gösterir. Üretimde admin erişimini OIDC/Auth.js veya kurumsal SSO ile sağlayın; session cookie `httpOnly`, `secure`, `sameSite=lax` olmalı. Rolleri `admin`, `editor`, `viewer` olarak server-side kontrol edin. SSE endpoint'i Redis pub/sub'dan sadece yetkili session'a olay taşımalıdır; secret veya ham lisanslı payload frontend'e gönderilmemelidir.

## Slack ve uyarılar

`SLACK_WEBHOOK_URL` yalnızca alerts worker'a verilir. Reuters kesintisi, X yayın/auth hatası, queue backlog, olağan dışı hacim, pause ve yüksek riskli bekleyen aday için rate-limitli uyarı üretin. Webhook'a haber metninin tamamı veya secret konmaz.

## Production deployment

Always-on worker zorunludur; yalnızca serverless cron kullanmayın. VPS/container platformunda dashboard ve worker ayrı servisler; managed PostgreSQL/Redis private network'te olmalıdır. TLS, günlük backup + restore testi, Redis persistence, secret manager, rolling deploy, health/readiness probes ve merkezi log/error monitoring etkinleştirin. Worker concurrency ve poll interval sağlayıcı limitlerine göre ayarlanır. Kuyruk gecikmesi, source discovery latency, AI latency, X latency, DLQ ve hata oranlarına alarm koyun.

Yayın öncesi kontrol listesi: gerçek feed lisansları, atıf şartları, X planı/kuralları, KVKK/GDPR saklama politikası, editoryal escalation, düzeltme süreci, failover, load test ve güvenlik incelemesi.

## Sorun giderme

- Dashboard açılmıyorsa Node sürümünü ve `pnpm build` çıktısını kontrol edin.
- Worker Redis'e bağlanmıyorsa `REDIS_URL`, TLS ve network policy'yi kontrol edin.
- Kaynak `RED` ise health logdaki HTTP/auth/parse ayrımına bakın; scraping'e geçmeyin.
- Gönderi uzun ise `twitter-text` weighted count sonucunu kullanın; cümleyi körlemesine kesmeyin.
- X timeout'unda tekrar yayınlamadan önce idempotency kaydı ve hesap timeline/post ID kontrolü yapın.
- Migration sorunu varsa boş bir staging veritabanında migration'ı doğrulayıp backup aldıktan sonra uygulayın.

## Kapsam durumu

Bu milestone; çalışan dashboard, kaynak sözleşmesi ve registry placeholder'ları, RSS/lisanslı/fixture adaptörleri, normalize-score-decision hattı, structured AI sınırı, X weighted validation, idempotent dry-run publisher, BullMQ başlangıç worker'ı, PostgreSQL şeması, Docker ve unit/integration testleri sağlar. Gerçek Reuters/Anadolu/X bağlantıları, kimlik sağlayıcısı ve canlı SSE; sözleşme/credential seçimine bağlı production entegrasyonlarıdır ve placeholder olarak güvenli biçimde kapalıdır.
