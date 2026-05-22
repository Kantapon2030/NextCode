export interface Template {
  id: string;
  label: string;
  language: 'html' | 'python' | 'c' | 'cpp' | 'blank';
  files: Record<string, string>;
  previewMode: 'web' | 'terminal';
}

const HTML_TEMPLATE: Template = {
  id: 'html',
  label: 'หน้าเว็บ HTML+CSS+JS',
  language: 'html',
  previewMode: 'web',
  files: {
    'index.html': `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nextcode Web Project</title>
  <link rel="stylesheet" href="style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --background: #0b0f19;
      --surface: rgba(255, 255, 255, 0.03);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Sarabun', 'Outfit', sans-serif;
      background-color: var(--background);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }

    /* Ambient background lights */
    .glow-orb {
      position: absolute;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
      top: -10%;
      right: -10%;
      z-index: 1;
      pointer-events: none;
    }

    .glow-orb-2 {
      position: absolute;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, rgba(0, 0, 0, 0) 70%);
      bottom: -15%;
      left: -15%;
      z-index: 1;
      pointer-events: none;
    }
    
    .card {
      background: var(--surface);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      padding: 3rem;
      border-radius: 24px;
      max-width: 480px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), 
                  0 0 80px rgba(99, 102, 241, 0.05);
      z-index: 2;
      transition: transform 0.3s ease, border-color 0.3s ease;
    }

    .card:hover {
      transform: translateY(-4px);
      border-color: rgba(99, 102, 241, 0.25);
    }
    
    .icon {
      font-size: 3rem;
      margin-bottom: 1.5rem;
      display: inline-block;
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    
    h1 {
      font-family: 'Outfit', 'Sarabun', sans-serif;
      font-size: 2.25rem;
      font-weight: 800;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.025em;
    }
    
    p {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    
    .btn {
      display: inline-block;
      width: 100%;
      padding: 0.875rem 1.75rem;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      text-decoration: none;
      font-weight: 600;
      border-radius: 12px;
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
    }
    
    .btn:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
      transform: scale(1.01);
    }

    .btn:active {
      transform: scale(0.99);
    }
  </style>
</head>
<body>
  <div class="glow-orb"></div>
  <div class="glow-orb-2"></div>

  <div class="card">
    <div class="icon">✨</div>
    <h1>Nextcode IDE</h1>
    <p>ยินดีต้อนรับสู่เว็บโปรเจกต์ของคุณ หน้าเว็บนี้เขียนสไตล์ในตัวทั้งหมดแบบเบ็ดเสร็จในไฟล์เดียว ลองแก้ไขโค้ดเพื่อเริ่มสร้างสรรค์ได้เลย!</p>
    <button class="btn" onclick="alert('ยินดีต้อนรับสู่ Nextcode! 🚀')">เริ่มต้นใช้งาน</button>
  </div>
  
  <script src="script.js"></script>
</body>
</html>`,
    'style.css': `/* เขียนสไตล์ CSS ของคุณที่นี่ */`,
    'script.js': `// เขียนโค้ด JavaScript ของคุณที่นี่`,
  },
};

const PYTHON_TEMPLATE: Template = {
  id: 'python',
  label: 'Python Script',
  language: 'python',
  previewMode: 'terminal',
  files: {
    'main.py': `# โปรแกรม Python ของฉัน
# สร้างด้วย Nextcode IDE

def main():
    print("สวัสดีโลก! 🐍")
    print("Python รันใน Browser ได้แล้ว!")
    
    # ตัวอย่างการใช้งาน
    numbers = [1, 2, 3, 4, 5]
    total = sum(numbers)
    print(f"ผลรวมของ {numbers} = {total}")

if __name__ == "__main__":
    main()
`,
  },
};

const C_TEMPLATE: Template = {
  id: 'c',
  label: 'C Program',
  language: 'c',
  previewMode: 'terminal',
  files: {
    'main.c': `#include <stdio.h>
#include <stdlib.h>

int main() {
    printf("สวัสดีโลก!\\n");
    printf("C รันบน Browser ได้แล้ว!\\n");
    
    // ตัวอย่าง
    int arr[] = {1, 2, 3, 4, 5};
    int n = sizeof(arr) / sizeof(arr[0]);
    int sum = 0;
    for (int i = 0; i < n; i++) {
        sum += arr[i];
    }
    printf("ผลรวม = %d\\n", sum);
    
    return 0;
}
`,
  },
};

const CPP_TEMPLATE: Template = {
  id: 'cpp',
  label: 'C++ Program',
  language: 'cpp',
  previewMode: 'terminal',
  files: {
    'main.cpp': `#include <iostream>
#include <vector>
#include <numeric>
using namespace std;

int main() {
    cout << "สวัสดีโลก! 🚀" << endl;
    cout << "C++ รันบน Browser ได้แล้ว!" << endl;
    
    // ตัวอย่าง
    vector<int> v = {1, 2, 3, 4, 5};
    int sum = accumulate(v.begin(), v.end(), 0);
    cout << "ผลรวม = " << sum << endl;
    
    return 0;
}
`,
  },
};

const BLANK_TEMPLATE: Template = {
  id: 'blank',
  label: 'ว่างเปล่า (Blank)',
  language: 'blank',
  previewMode: 'web',
  files: {
    'index.html': `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>โปรเจกต์ใหม่</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <script src="script.js"></script>
</body>
</html>`,
    'style.css': `/* เขียนสไตล์ CSS ของคุณที่นี่ */`,
    'script.js': `// เขียนโค้ด JavaScript ของคุณที่นี่`,
  },
};

export const TEMPLATES: Template[] = [
  HTML_TEMPLATE,
  PYTHON_TEMPLATE,
  C_TEMPLATE,
  CPP_TEMPLATE,
  BLANK_TEMPLATE,
];

export function getTemplate(id: string): Template {
  return TEMPLATES.find(t => t.id === id) ?? BLANK_TEMPLATE;
}

export const SNIPPETS = {
  html: [
    {
      category: 'HTML พื้นฐาน',
      items: [
        { label: 'Div Container', code: '<div class="container">\n  \n</div>' },
        { label: 'ปุ่ม Button', code: '<button onclick="">คลิกฉัน</button>' },
        { label: 'รูปภาพ', code: '<img src="" alt="คำอธิบายรูป" width="300">' },
        { label: 'ลิงก์', code: '<a href="https://">ข้อความลิงก์</a>' },
      ],
    },
    {
      category: 'ฟอร์ม',
      items: [
        { label: 'ช่องกรอกข้อความ', code: '<input type="text" id="" placeholder="กรอกข้อความ...">' },
        { label: 'ฟอร์มพื้นฐาน', code: '<form onsubmit="return false;">\n  <input type="text" id="name" placeholder="ชื่อ">\n  <button type="submit">ส่ง</button>\n</form>' },
        { label: 'Select Dropdown', code: '<select id="">\n  <option value="1">ตัวเลือก 1</option>\n  <option value="2">ตัวเลือก 2</option>\n</select>' },
      ],
    },
    {
      category: 'ตาราง',
      items: [
        { label: 'ตารางพื้นฐาน', code: '<table border="1">\n  <tr>\n    <th>หัวตาราง 1</th>\n    <th>หัวตาราง 2</th>\n  </tr>\n  <tr>\n    <td>ข้อมูล 1</td>\n    <td>ข้อมูล 2</td>\n  </tr>\n</table>' },
      ],
    },
  ],
  python: [
    {
      category: 'Python ทั่วไป',
      items: [
        { label: 'Print', code: 'print("สวัสดี")' },
        { label: 'Input', code: 'name = input("ชื่อของคุณ: ")\nprint(f"สวัสดี, {name}!")' },
        { label: 'For Loop', code: 'for i in range(10):\n    print(i)' },
        { label: 'Function', code: 'def my_function(x):\n    return x * 2\n\nresult = my_function(5)\nprint(result)' },
        { label: 'List', code: 'my_list = [1, 2, 3, 4, 5]\nfor item in my_list:\n    print(item)' },
      ],
    },
  ],
  c: [
    {
      category: 'C พื้นฐาน',
      items: [
        { label: 'Printf', code: 'printf("สวัสดี\\n");' },
        { label: 'For Loop', code: 'for (int i = 0; i < 10; i++) {\n    printf("%d\\n", i);\n}' },
        { label: 'Function', code: 'int add(int a, int b) {\n    return a + b;\n}' },
        { label: 'Array', code: 'int arr[5] = {1, 2, 3, 4, 5};\nfor (int i = 0; i < 5; i++) {\n    printf("%d\\n", arr[i]);\n}' },
      ],
    },
  ],
};
