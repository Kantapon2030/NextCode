# Nextcode IDE 🚀

**Nextcode IDE** คือแพลตฟอร์มเขียนโค้ดและรันโค้ดแบบครบครัน (All-in-One Web IDE) ที่ทำงานบนเว็บเบราว์เซอร์ได้ทันทีโดยไม่ต้องติดตั้งซอฟต์แวร์เพิ่มเติม มาพร้อมผู้ช่วยอัจฉริยะ AI ในการแนะแนวทาง แก้ไขจุดบกพร่อง และอธิบายการทำงานของโค้ดเป็นภาษาไทยอย่างเต็มรูปแบบ

---

## ✨ ฟีเจอร์หลัก (Key Features)

- 📁 **In-Browser Runtimes & Multi-Language Support:**
  - รองรับการเขียนและแสดงผลภาษา **HTML / CSS / JavaScript** แบบเรียลไทม์ (Live Preview)
  - รันภาษา **Python, C, และ C++** ได้โดยตรงจากในเบราว์เซอร์
- 🤖 **AI-Powered Developer Assistant (Gemini 2.5 Flash Lite):**
  - **AI Inline Autocomplete:** แนะนำโค้ดขณะพิมพ์แบบ Ghost Text (กด `Tab` เพื่อยอมรับข้อเสนอแนะ)
  - **AI Panel:** ผู้ช่วยอัจฉริยะด้านล่างหน้าจอช่วยวิเคราะห์หาบั๊ก เจนโค้ด และเขียนคำอธิบายเป็นภาษาไทย
- ⚙️ **Premium Developer Experience (Monaco Editor):**
  - ใช้ขุมพลังเดียวกับ VS Code รองรับการจัดฟอร์แมตอัตโนมัติ (Format on Save / Format Code), การเปลี่ยนขนาดและรูปแบบฟอนต์ (เช่น JetBrains Mono, Fira Code)
- 💾 **Local-First & Offline Support:**
  - จัดเก็บโปรเจกต์และไฟล์ต่างๆ บนพื้นที่เก็บข้อมูลของเบราว์เซอร์คุณโดยตรงผ่าน **IndexedDB (Dexie.js)** ทำงานได้ลื่นไหลแม้ไม่มีอินเทอร์เน็ต
- ☁️ **Cloud Sync & Integrations:**
  - ซิงก์โปรเจกต์ขึ้น Cloud อัตโนมัติผ่านการเชื่อมต่อ **Google Drive**
  - เชื่อมต่อและสำรองข้อมูลโค้ดอย่างปลอดภัยผ่าน **GitHub Gists**
- 🎨 **Responsive & Rich Aesthetics UI:**
  - หน้าจอปรับขนาดตามอุปกรณ์ รองรับ Dark Mode, Light Mode และ High Contrast Mode สำหรับการถนอมสายตา
  - ออกแบบด้วยความหรูหราทันสมัยตามสไตล์ Glassmorphism และ Micro-animations ที่ตอบสนองได้นุ่มนวล
- 📲 **Progressive Web App (PWA):**
  - สามารถติดตั้งเป็นแอปพลิเคชันลงบนเครื่องคอมพิวเตอร์ แท็บเล็ต หรือสมาร์ทโฟนได้โดยตรงเพื่อเปิดใช้งานอย่างรวดเร็ว

---

## 🛠️ Stack & Technologies

- **Frontend Core:** React, Vite, TypeScript
- **Styling:** Tailwind CSS, PostCSS, Lucide React (Icons)
- **Editor:** `@monaco-editor/react` (Monaco Editor Integration)
- **Storage & Database:** Dexie.js (IndexedDB wrapper)
- **AI API Integration:** Google Gemini API (v1beta Models Endpoint)
- **Other Utilities:** JSZip (สำหรับ Export ZIP), diff (สำหรับเปรียบเทียบโค้ด AI)

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

3. **ตั้งค่าสิ่งแวดล้อม (Environment Variables):**
   สร้างไฟล์ `.env.local` ที่โฟลเดอร์รูทของโปรเจกต์ และระบุค่าต่างๆ ดังนี้:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id_here
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_SUPABASE_URL=your_supabase_url_here
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   VITE_GITHUB_CLIENT_ID=your_github_oauth_client_id_here
   ```

4. **รันบนเครื่องในโหมด Development:**
   ```bash
   npm run dev
   ```

5. **สร้าง Build สำหรับ Deploy:**
   ```bash
   npm run build
   ```

---

## 🔒 ความปลอดภัยของข้อมูล (Data Privacy)
* ข้อมูลโค้ดโปรเจกต์และกุญแจส่วนตัว (API Keys) ทั้งหมดถูกจัดเก็บในอุปกรณ์ของผู้ใช้อย่างปลอดภัย โดยใช้การเข้ารหัสระดับเบราว์เซอร์
* จะไม่มีการนำข้อมูลโค้ดหรือคีย์ส่งผ่านเซิร์ฟเวอร์ภายนอก ยกเว้นการเชื่อมต่อโดยตรงไปยัง API ทางการของ Google Gemini และ Cloud Sync ที่คุณกำหนดเอง

---
* พัฒนาและออกแบบโดย **Kantapon** · ขับเคลื่อนด้วยขุมพลัง **Gemini 2.5 Flash Lite**
