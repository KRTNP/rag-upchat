# RAG Chat Frontend Design (Production Chat UI)

## Context
โปรเจกต์มี backend RAG พร้อมใช้งานแล้ว (`/api/chat`) แต่หน้า frontend ยังเป็น MVP เรียบง่ายและยังขาด UX/state ที่จำเป็นสำหรับใช้งานจริง

## Goal
ยกระดับหน้าแชตให้เป็น production-ready frontend โดยไม่เปลี่ยน business logic ฝั่ง API

## Scope
- ปรับโครงสร้างหน้า `app/page.tsx` ให้ดูแลง่ายขึ้น
- เพิ่มฟังก์ชันส่งข้อความครบ (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)
- เพิ่ม loading, error handling, retry, clear chat, auto-scroll
- ปรับ UI/UX ให้ responsive และเข้าถึงได้ (a11y)
- ปรับธีมและ visual identity ให้สวยและมีเอกลักษณ์
- อัปเดต metadata

## Out of Scope
- เพิ่ม endpoint ใหม่ฝั่ง backend
- เพิ่มระบบ auth หรือจัดการเอกสารจากหน้าเว็บ

## UX Requirements
1. ผู้ใช้ส่งข้อความได้ทั้งปุ่มส่งและกด Enter
2. ระหว่างรอคำตอบ ปิดปุ่มส่งและแสดงสถานะกำลังประมวลผล
3. หาก API error แสดงข้อผิดพลาดชัดเจนและกด retry ได้
4. ข้อความใหม่เลื่อนไปท้ายรายการอัตโนมัติ
5. รองรับหน้าจอมือถือและเดสก์ท็อป
6. มี empty state ก่อนเริ่มสนทนา

## Architecture
- `app/page.tsx` เป็น orchestrator ของ state หลัก
- แยกคอมโพเนนต์ย่อยเพื่อแบ่งความรับผิดชอบ:
  - `app/components/chat-shell.tsx`
  - `app/components/message-list.tsx`
  - `app/components/chat-composer.tsx`
  - `app/components/chat-status.tsx`
- ใช้ type กลางสำหรับ message และ request state ที่ `app/lib/chat-types.ts`

## Data Flow
1. ผู้ใช้พิมพ์ input แล้ว submit
2. UI append user message -> set loading
3. เรียก `POST /api/chat` ด้วย `{ question }`
4. สำเร็จ: append bot message, clear error, reset loading
5. ล้มเหลว: set error, reset loading, ให้ผู้ใช้ retry ได้

## Error Handling
- Handle network/JSON/API error ในฝั่ง client
- แสดงข้อความ fallback ที่อ่านง่าย
- ไม่ให้ UI crash จาก response ที่ไม่เป็นไปตามรูปแบบ

## Testing Strategy
- เพิ่มชุดทดสอบ UI logic ด้วย Vitest + React Testing Library
- กรณีทดสอบหลัก:
  - submit ด้วย Enter
  - disable ระหว่าง loading
  - แสดง error เมื่อ API ล้มเหลว
  - retry ส่งข้อความเดิมได้
  - clear chat เคลียร์รายการข้อความ

## Acceptance Criteria
- ฟังก์ชัน UX หลักทั้งหมดทำงานครบตาม requirements
- หน้า responsive และอ่านง่ายบนมือถือ
- ผ่าน lint และ test ที่เพิ่มใหม่
