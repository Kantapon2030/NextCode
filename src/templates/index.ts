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
  <title>โปรเจกต์ของฉัน</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="header">
    <div class="container">
      <h1>ยินดีต้อนรับ! 👋</h1>
      <p>เริ่มสร้างเว็บไซต์สวยๆ ได้เลย</p>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <h2>เว็บไซต์ของฉัน</h2>
      <p>แก้ไขโค้ดทางซ้าย แล้วดูผลลัพธ์ที่นี่</p>
      <button id="btn-hello" onclick="sayHello()">คลิกฉัน!</button>
    </section>
  </main>

  <script src="script.js"></script>
</body>
</html>`,
    'style.css': `/* รีเซ็ต CSS พื้นฐาน */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Sarabun', sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  color: #333;
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px;
}

.header {
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  padding: 20px 0;
  color: white;
  text-align: center;
}

.header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.header p {
  font-size: 1.1rem;
  opacity: 0.9;
}

.hero {
  background: white;
  border-radius: 16px;
  padding: 48px;
  margin: 40px auto;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}

.hero h2 {
  font-size: 2rem;
  color: #4a5568;
  margin-bottom: 16px;
}

.hero p {
  font-size: 1.1rem;
  color: #718096;
  margin-bottom: 32px;
}

button {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 14px 36px;
  border-radius: 50px;
  font-size: 1rem;
  font-family: 'Sarabun', sans-serif;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 15px rgba(102,126,234,0.4);
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102,126,234,0.5);
}

button:active {
  transform: translateY(0);
}`,
    'script.js': `// สวัสดีโลก! เริ่มเขียน JavaScript ได้เลย
console.log('โปรเจกต์พร้อมแล้ว!');

function sayHello() {
  const messages = [
    'สวัสดีครับ! 😊',
    'ยินดีต้อนรับ! 🎉',
    'โค้ดสนุกนะ! 💻',
    'เก่งมากเลย! 🌟',
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  alert(msg);
}
`,
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
</head>
<body>
  <!-- เริ่มเขียนโค้ดได้เลย -->
</body>
</html>`,
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
