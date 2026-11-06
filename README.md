# Nextcode IDE 🚀

**Nextcode IDE** คือแพลตฟอร์มเขียนโค้ดและรันโค้ดแบบครบครันบนเว็บเบราว์เซอร์ (Pure Web & Local-First IDE) ที่เน้นความรวดเร็ว น้ำหนักเบา ปลอดภัย และให้ความเป็นส่วนตัวสูงสุด ทำงานได้โดยตรงบนเบราว์เซอร์โดยไม่ต้องพึ่งพาเซิร์ฟเวอร์ฐานข้อมูลภายนอก

---

## ✨ จุดเด่นและฟีเจอร์หลัก (Key Features)

### 1. ⚡ Pure In-Browser & Local-First (ปลอดภัย ใช้งานได้แม้ออฟไลน์)
- **Local-First Data Storage:** โค้ดและโปรเจกต์ทั้งหมดถูกบันทึกไว้ในเครื่องของคุณผ่าน **IndexedDB (Dexie.js)** ทำให้ทำงานได้รวดเร็ว ข้อมูลไม่รั่วไหล และใช้งานได้ทันทีโดยไม่ต้องเชื่อมต่ออินเทอร์เน็ต
- **Guest Mode:** เริ่มเขียนโค้ดได้ทันทีโดยไม่ต้องสมัครสมาชิกหรือล็อกอิน
- **Zero Database Server:** ไม่มีการเก็บโค้ดของคุณไว้บนฐานข้อมูลเซิร์ฟเวอร์ส่วนกลางใดๆ

### 2. ☁️ การเชื่อมต่อภายนอก: Google Login เพื่อสำรองโค้ดเท่านั้น (Cloud Sync)
- **ระบบภายนอกเพียงหนึ่งเดียว:** เชื่อมต่อกับภายนอกเฉพาะ **Google Login (Google OAuth 2.0)** เท่านั้น
- **ซิงก์ตรงกับ Google Drive ส่วนตัว:** เมื่อเข้าสู่ระบบ โปรเจกต์จะถูกสำรองและซิงก์เก็บไว้ในไฟล์ `nextcode-data.json` บน **Google Drive ของตัวคุณเองโดยตรง**
- **ปลอดภัยและเป็นส่วนตัว 100%:** มีเพียงคุณคนเดียวที่สามารถเข้าถึงโค้ดของตนเองได้
*(ระบบภายนอกอื่นๆ เช่น GitHub Gist, Supabase หรือ Backend Container เดิม ถูกตัดออกทั้งหมดเพื่อความกระชับ รวดเร็ว และเป็นส่วนตัว)*

### 3. 💻 การรองรับภาษาและการรันโค้ด (Multi-Language Execution & Input Support)

| ภาษา | กลไกการรันโค้ด (Runtime) | การรับค่า Input |
|---|---|---|
| **HTML / CSS / JS** | In-Browser Sandboxed `<iframe>` แบบ Live Preview | รองรับ `<input>`, `<form>`, `prompt()`, `alert()` ได้สมบูรณ์ |
| **Python** | **Pyodide (WebAssembly)** รันใน Web Worker อิสระ | รองรับคำสั่ง `input()` ผ่าน **SharedArrayBuffer + Atomics** โดยหน้าต่าง Editor ไม่ค้าง |
| **C / C++** | Remote Compiler (Godbolt & Wandbox) พร้อมระบบตรวจจับ EOF | รองรับ `scanf()` และ `std::cin` ผ่านการตรวจจับและป้อนค่าใน Terminal แบบ Interactive |

### 4. ⚙️ Monaco Editor (ขุมพลังเดียวกับ VS Code)
- IntelliSense และ Syntax Highlighting ครบทุกภาษา
- Snippet Shortcuts & Emmet Expansion (พิมพ์ชอร์ตคัทแล้วกด `Tab` เพื่อขยายโค้ด)
- ฟอร์แมตโค้ดอัตโนมัติ (`Ctrl+Shift+F`)
- สลับ Minimap, ปรับขนาดฟอนต์, เปลี่ยนสลับ Dark / Light / High Contrast Theme
- Virtual File System (VFS) รองรับการสร้างโฟลเดอร์ ซ้อนโฟลเดอร์ ลากไฟล์รูปภาพมาวาง และส่งออกเป็น ZIP ได้ในคลิกเดียว

### 5. 📲 Progressive Web App (PWA)
- สามารถกดติดตั้ง (Install) เป็นแอปบน Desktop (Windows, macOS, Linux) หรือบนแท็บเล็ตได้ทันที

---

## 🛠️ Stack & Technologies

- **Core Framework:** React 19, Vite, TypeScript
- **Styling & UI:** Tailwind CSS, PostCSS, Lucide React (Icons)
- **Code Editor:** `@monaco-editor/react` (Monaco Editor Integration)
- **Local Database:** Dexie.js (IndexedDB)
- **Language Runtimes:**
  - Python: Pyodide (Python 3.12 WebAssembly) + Web Worker
  - C / C++: Godbolt Compiler Explorer API (GCC 13.2) & Wandbox API
- **Cloud Storage:** Google Drive REST API v3 (ผ่าน Google Identity Services)
- **PWA Engine:** `vite-plugin-pwa` (Workbox Service Worker)

---

## 🔑 การตั้งค่า Google Login (Optional)

หากต้องการใช้งานฟีเจอร์ซิงก์โปรเจกต์ขึ้น Google Drive ส่วนตัว ให้สร้างไฟล์ `.env.local` ในโฟลเดอร์หลักของโปรเจกต์:

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id_here.apps.googleusercontent.com
```

> **หมายเหตุ:** หากไม่ได้ตั้งค่า Google Client ID ระบบยังคงสามารถใช้งานในโหมด **Guest Mode** ได้เต็มประสิทธิภาพ 100% โดยจัดเก็บข้อมูลไว้ในเครื่องผ่าน IndexedDB

---

## 🚀 เริ่มต้นใช้งานในเครื่อง (Local Setup)

1. **โคลนโปรเจกต์:**
   ```bash
   git clone https://github.com/Kantapon2030/NextCode.git
   cd NextCode
   ```

2. **ติดตั้ง Dependencies:**
   ```bash
   npm install
   ```

3. **รันบนเครื่องในโหมด Development:**
   ```bash
   npm run dev
   ```
   เปิดเบราว์เซอร์ไปที่ `http://localhost:5173`

4. **สร้าง Production Build:**
   ```bash
   npm run build
   ```

---

## 🌐 การ Deploy (Deployment)

โปรเจกต์นี้ได้รับการตั้งค่าพร้อมสำหรับการ Deploy บน **Cloudflare Pages**, **Vercel** หรือ Web Hosting ทั่วไป:

### ข้อกำหนดสำคัญสำหรับ Cross-Origin Isolation (เพื่อให้ Python `input()` ทำงานได้):
เว็บเซิร์ฟเวอร์ต้องส่ง Response Headers ดังนี้:
```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```
*(ไฟล์คอนฟิก `public/_headers` ได้รับการเตรียมไว้ให้อัตโนมัติสำหรับ Cloudflare Pages เรียบร้อยแล้ว)*

---

* พัฒนาและออกแบบโดย **Kantapon**
