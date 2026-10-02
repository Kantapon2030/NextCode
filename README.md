# Nextcode IDE 🚀

**Nextcode IDE** คือแพลตฟอร์มเขียนโค้ดและรันโค้ดแบบครบครัน (All-in-One Pure Web IDE) ที่ออกแบบมาเพื่อการเขียนโค้ดเพียวๆ บนเว็บเบราว์เซอร์ Chrome ได้ทันที ทำงานได้เต็มประสิทธิภาพ รวดเร็ว น้ำหนักเบา และปลอดภัย ไม่ต้องพึ่งพาเซิร์ฟเวอร์ภายนอกหรือระบบ AI

---

## ✨ ฟีเจอร์หลัก (Key Features)

- ⚡ **Pure In-Browser Code Editing:**
  - เน้นการเขียนโค้ดเพียวๆ ลื่นไหล รวดเร็ว ไม่มี AI หน่วงเครื่องหรือใช้ quota API
  - เริ่มต้นใช้งานได้ทันทีด้วยปุ่ม "เริ่มเขียนโค้ดทันที (Guest Mode)" โดยไม่ต้องล็อกอิน
- 📁 **In-Browser Runtimes & Multi-Language Support:**
  - รองรับการเขียนและแสดงผลภาษา **HTML / CSS / JavaScript** แบบเรียลไทม์ (Live Preview พร้อม iframe sandbox)
  - รันภาษา **Python** ได้โดยตรงในเบราว์เซอร์ผ่าน Pyodide และ SharedArrayBuffer
  - รันภาษา **C และ C++** ผ่าน online compiler runtime พร้อมระบบจัดการข้อผิดพลาดและจัดบรรทัด
- ⚙️ **Monaco Editor (ขุมพลังเดียวกับ VS Code):**
  - รองรับ IntelliSense, Syntax Highlighting ครบทุกภาษา
  - Built-in Snippets & Emmet expansion (พิมพ์ชอร์ตคัทแล้วกด `Tab` เพื่อเติมโค้ด)
  - ฟอร์แมตโค้ดอัตโนมัติ (`Ctrl+Shift+F`), สลับ Minimap, ปรับขนาดฟอนต์ และเปลี่ยนธีม
- 💾 **Local-First & Offline Support:**
  - จัดเก็บโปรเจกต์และไฟล์ต่างๆ บนพื้นที่เก็บข้อมูลของเบราว์เซอร์คุณโดยตรงผ่าน **IndexedDB (Dexie.js)**
  - ปลอดภัย ข้อมูลไม่รั่วไหล ทำงานได้แม้ไม่มีสัญญาณอินเทอร์เน็ต
- ☁️ **Cloud Sync & Integrations (อุปกรณ์เสริม):**
  - ซิงก์โปรเจกต์ขึ้น Cloud ผ่านการเชื่อมต่อ **Google Drive**
  - เชื่อมต่อและสำรองข้อมูลโค้ดผ่าน **GitHub Gists**
  - ส่งออกโปรเจกต์เป็นไฟล์ ZIP ได้ในคลิกเดียว
- 🎨 **Responsive & Rich Modern UI:**
  - รองรับ Dark Mode, Light Mode และ High Contrast Mode
  - ออกแบบด้วย Glassmorphism ทันสมัย ใช้งานได้ดีทั้งบนหน้าจอ Desktop และ Mobile
- 📲 **Progressive Web App (PWA):**
  - สามารถติดตั้งเป็นแอปพลิเคชันลงบนเครื่องคอมพิวเตอร์ แท็บเล็ต หรือสมาร์ทโฟนได้โดยตรง

---

## 🛠️ Stack & Technologies

- **Frontend Core:** React, Vite, TypeScript
- **Styling:** Tailwind CSS, PostCSS, Lucide React (Icons)
- **Editor:** `@monaco-editor/react` (Monaco Editor Integration)
- **Database / VFS:** Dexie.js (IndexedDB wrapper)
- **Runtimes:** Pyodide (Python WebAssembly), Wandbox / Piston (C/C++)
- **Deployment:** Cloudflare Pages ready (พร้อม `_redirects`, `_headers`, และ `wrangler.toml`)

---

## ☁️ การ Deploy บน Cloudflare Pages

โปรเจกต์นี้ได้รับการปรับแต่งและพร้อมสำหรับการ deploy บน **Cloudflare Pages** ทันที:

1. เชื่อมต่อ Git Repository บน Cloudflare Pages Dashboard
2. กำหนดค่า Build Settings ดังนี้:
   - **Framework preset:** `Vite` (หรือ None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. ไฟล์คอนฟิกที่เตรียมไว้ให้อัตโนมัติ:
   - `public/_redirects`: จัดการ SPA routing (`/* /index.html 200`) ไม่เกิดปัญหา 404 เมื่อรีเฟรชหน้า
   - `public/_headers`: ตั้งค่า `Cross-Origin-Opener-Policy` และ `Cross-Origin-Embedder-Policy: credentialless` เพื่อให้ `SharedArrayBuffer` ใน Chrome สามารถทำงานกับ Python input() ได้เต็มรูปแบบ
   - `wrangler.toml`: สำหรับ deploy ผ่าน Cloudflare Wrangler CLI (`npx wrangler pages deploy dist`)

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

4. **สร้าง Build สำหรับ Deploy:**
   ```bash
   npm run build
   ```

---

* พัฒนาและออกแบบโดย **Kantapon**
