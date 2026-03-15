# rag-upchat

แอปแชต RAG (Next.js) ที่ใช้:
- Cloudflare AI (`@cf/baai/bge-m3`) สำหรับ embedding
- Supabase (Postgres + pgvector) สำหรับ vector search
- Gemini (`gemini-2.5-flash`) สำหรับตอบคำถาม

## โครงสร้างหลัก

- `app/page.tsx` หน้าแชต
- `app/api/chat/route.ts` endpoint ตอบคำถามด้วย RAG + Gemini
- `app/api/embed/route.ts` endpoint สำหรับสร้าง embedding
- `app/lib/embedding.ts` helper เรียก Cloudflare embedding
- `app/lib/supabase.ts` helper สร้าง Supabase client จาก env
- `scripts/embed.js` สคริปต์ฝัง embedding ให้ข้อมูลในตาราง `documents`

## 1) ติดตั้ง

```bash
npm install
```

## 2) ตั้งค่า Environment

สร้างไฟล์ `.env.local`:

```env
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
ADMIN_API_KEY=...
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
```

## 3) เตรียมฐานข้อมูล Supabase

รัน SQL นี้ใน Supabase SQL Editor:

```sql
create extension if not exists vector;

create table if not exists documents (
  id bigserial primary key,
  question text not null,
  answer text not null,
  embedding vector(1024)
);

create or replace function match_documents(
  query_embedding vector(1024),
  match_threshold float default 0.7,
  match_count int default 3
)
returns table (
  id bigint,
  question text,
  answer text,
  similarity float
)
language sql
as $$
  select
    documents.id,
    documents.question,
    documents.answer,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.embedding is not null
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;
```

## 4) ใส่ข้อมูลคำถาม/คำตอบ

นำเข้า `data.csv` ลงตาราง `documents` (ต้องมีคอลัมน์ `question`, `answer`)

## 5) สร้าง embedding ให้เอกสาร

```bash
node scripts/embed.js
```

## 6) รันโปรเจกต์

```bash
npm run dev
```

เปิด `http://localhost:3000`

## 7) จัดการข้อมูล RAG ผ่านหน้า Admin

- เปิด `http://localhost:3000/admin`
- เข้าระบบด้วย `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- หรือใช้ `ADMIN_API_KEY` เป็น fallback ได้
- หน้า Admin รองรับ:
  - ค้นหา/เพิ่ม/แก้ไข/ลบ เอกสารในตาราง `documents`
  - Re-embed รายเอกสาร หรือ Re-embed ทั้งระบบ
  - นำเข้า CSV (`question,answer`) และสั่ง embed ทันทีได้
  - Dashboard metrics (total/embedded/pending/latest id)

> แนะนำให้ตั้ง `SUPABASE_SERVICE_ROLE_KEY` สำหรับสิทธิ์เขียนข้อมูลในระบบ Admin/API ฝั่งเซิร์ฟเวอร์

## 8) รันทดสอบ

```bash
npm run test:run
npm run lint
npm run build
npm run test:e2e
```

## หมายเหตุ

- โค้ดถูกปรับให้ `build` ผ่านแล้วและไม่ hardcode `http://localhost:3000` ใน API ภายใน
- ถ้า env ไม่ครบ API จะตอบ error ชัดเจนแทนพังตอน build
