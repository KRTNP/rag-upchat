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
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
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

## หมายเหตุ

- โค้ดถูกปรับให้ `build` ผ่านแล้วและไม่ hardcode `http://localhost:3000` ใน API ภายใน
- ถ้า env ไม่ครบ API จะตอบ error ชัดเจนแทนพังตอน build
