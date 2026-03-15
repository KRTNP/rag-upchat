# RAG Chat Frontend Production UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยกระดับหน้าแชตให้ครบฟังก์ชันใช้งานจริง พร้อมดีไซน์ responsive และ accessibility โดยไม่แก้ business logic backend

**Architecture:** แยกหน้าแชตเป็นคอมโพเนนต์ย่อยที่ชัดเจน, รวม type และ helper ที่ใช้ร่วมกัน, และเพิ่ม test ครอบคลุม UX flow หลัก (submit/loading/error/retry/clear).

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS variables, Vitest, React Testing Library

---

### Task 1: Setup Test Harness For TDD

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `app/test/setup.ts`

- [ ] **Step 1: Add failing test command usage expectation**
Add scripts/deps needed for test-first flow.

- [ ] **Step 2: Run test command to verify failure before setup complete**
Run: `npm run test`
Expected: command fails because test tooling not configured yet.

- [ ] **Step 3: Implement minimal Vitest setup**
Add Vitest + jsdom + RTL + setup file.

- [ ] **Step 4: Run test command to verify harness works**
Run: `npm run test -- --run`
Expected: command runs and reports no tests found or existing tests pass.

### Task 2: Create Chat UI Tests First

**Files:**
- Create: `app/components/chat-page.test.tsx`
- Test: `app/components/chat-page.test.tsx`

- [ ] **Step 1: Write failing tests for key UX behaviors**
Cover Enter submit, loading disabled state, API error render, retry, clear chat.

- [ ] **Step 2: Run focused tests and confirm RED**
Run: `npm run test -- app/components/chat-page.test.tsx --run`
Expected: FAIL due to missing components/logic.

### Task 3: Implement Chat UI Components

**Files:**
- Create: `app/lib/chat-types.ts`
- Create: `app/components/chat-shell.tsx`
- Create: `app/components/message-list.tsx`
- Create: `app/components/chat-composer.tsx`
- Create: `app/components/chat-status.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement minimal code to satisfy tests**
Build component structure and state flow to pass failing tests.

- [ ] **Step 2: Run focused tests and confirm GREEN**
Run: `npm run test -- app/components/chat-page.test.tsx --run`
Expected: PASS.

- [ ] **Step 3: Refactor for readability while keeping tests green**
Extract helpers/types and simplify state transitions.

### Task 4: Apply Distinctive Visual Design

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add design tokens and page-level styling system**
Define variables for color, spacing, radii, shadows, and motion.

- [ ] **Step 2: Improve typography and metadata**
Use expressive font pair and update title/description.

- [ ] **Step 3: Validate responsive + a11y details**
Ensure focus states, contrast, and mobile layout quality.

### Task 5: Final Verification

**Files:**
- Modify: `README.md` (only if commands/behavior changed)

- [ ] **Step 1: Run all tests**
Run: `npm run test -- --run`
Expected: PASS.

- [ ] **Step 2: Run lint**
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Build verification**
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Document updates (if needed)**
Update README for frontend/test command additions.
