// ────────────────────────────────────────────────────────────
// Snippet Shortcuts for Nextcode IDE
// Monaco CompletionItemProvider + Tab key expansion
// ────────────────────────────────────────────────────────────
import { expandEmmet, TAG_SHORTHANDS } from './emmetHelper';

export interface Snippet {
  trigger: string;
  label: string;
  description: string;
  body: string;        // VSCode snippet syntax: ${1:placeholder}
  language: string[];  // e.g. ['html'], ['css'], ['all']
}

// ────────────────────────────────────────────────────────────
// BUILTIN SNIPPETS
// ────────────────────────────────────────────────────────────
export const BUILTIN_SNIPPETS: Snippet[] = [

  // ── HTML ──────────────────────────────────────────────────
  {
    trigger: '!',
    label: 'HTML5 Boilerplate',
    description: 'โครงสร้าง HTML5 มาตรฐาน',
    language: ['html'],
    body: `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="\${1:คำอธิบายเว็บ}">
  <title>\${2:ชื่อเว็บไซต์}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  \${3:<!-- เนื้อหา -->}

  <script src="script.js"></script>
</body>
</html>`,
  },
  {
    trigger: '!nav',
    label: 'Navigation Bar',
    description: 'เมนู navigation พร้อม logo และ links',
    language: ['html'],
    body: `<nav class="navbar">
  <div class="nav-brand">
    <a href="#">\${1:Logo}</a>
  </div>
  <ul class="nav-links">
    <li><a href="#">\${2:หน้าแรก}</a></li>
    <li><a href="#">\${3:เกี่ยวกับ}</a></li>
    <li><a href="#">\${4:ติดต่อ}</a></li>
  </ul>
</nav>`,
  },
  {
    trigger: '!hero',
    label: 'Hero Section',
    description: 'ส่วน hero พร้อม headline และปุ่ม CTA',
    language: ['html'],
    body: `<section class="hero">
  <div class="hero-content">
    <h1>\${1:หัวข้อหลัก}</h1>
    <p>\${2:คำอธิบาย}</p>
    <a href="#" class="btn-primary">\${3:เริ่มต้นใช้งาน}</a>
  </div>
</section>`,
  },
  {
    trigger: '!card',
    label: 'Card Component',
    description: 'การ์ดพร้อมรูปและข้อความ',
    language: ['html'],
    body: `<div class="card">
  <img src="\${1:image.jpg}" alt="\${2:คำอธิบายรูป}">
  <div class="card-body">
    <h3>\${3:ชื่อการ์ด}</h3>
    <p>\${4:รายละเอียด}</p>
    <button class="btn">\${5:อ่านเพิ่มเติม}</button>
  </div>
</div>`,
  },
  {
    trigger: '!form',
    label: 'Contact Form',
    description: 'ฟอร์มติดต่อพร้อม input fields',
    language: ['html'],
    body: `<form class="form" action="#" method="POST">
  <div class="form-group">
    <label for="name">\${1:ชื่อ}</label>
    <input type="text" id="name" name="name"
           placeholder="\${2:กรอกชื่อของคุณ}" required>
  </div>
  <div class="form-group">
    <label for="email">\${3:อีเมล}</label>
    <input type="email" id="email" name="email"
           placeholder="\${4:กรอกอีเมล}" required>
  </div>
  <div class="form-group">
    <label for="message">\${5:ข้อความ}</label>
    <textarea id="message" name="message"
              rows="5" placeholder="\${6:กรอกข้อความ}"></textarea>
  </div>
  <button type="submit">\${7:ส่งข้อความ}</button>
</form>`,
  },
  {
    trigger: '!table',
    label: 'HTML Table',
    description: 'ตารางพร้อม header และ 3 แถว',
    language: ['html'],
    body: `<table class="table">
  <thead>
    <tr>
      <th>\${1:คอลัมน์ 1}</th>
      <th>\${2:คอลัมน์ 2}</th>
      <th>\${3:คอลัมน์ 3}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>\${4:ข้อมูล}</td>
      <td>\${5:ข้อมูล}</td>
      <td>\${6:ข้อมูล}</td>
    </tr>
    <tr>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>`,
  },
  {
    trigger: '!grid',
    label: 'CSS Grid Layout',
    description: 'layout grid พร้อม header/sidebar/main/footer',
    language: ['html'],
    body: `<div class="grid-container">
  <header class="grid-header">\${1:Header}</header>
  <aside class="grid-sidebar">\${2:Sidebar}</aside>
  <main class="grid-main">\${3:Main Content}</main>
  <footer class="grid-footer">\${4:Footer}</footer>
</div>`,
  },
  {
    trigger: '!flex',
    label: 'Flexbox Container',
    description: 'container แบบ flexbox 3 items',
    language: ['html'],
    body: `<div class="flex-container">
  <div class="flex-item">\${1:Item 1}</div>
  <div class="flex-item">\${2:Item 2}</div>
  <div class="flex-item">\${3:Item 3}</div>
</div>`,
  },
  {
    trigger: '!modal',
    label: 'Modal Dialog',
    description: 'popup modal พร้อมปุ่มปิด',
    language: ['html'],
    body: `<div class="modal" id="\${1:myModal}">
  <div class="modal-overlay" onclick="closeModal()"></div>
  <div class="modal-content">
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h2>\${2:ชื่อ Modal}</h2>
    <p>\${3:เนื้อหา}</p>
    <button class="btn" onclick="closeModal()">\${4:ปิด}</button>
  </div>
</div>`,
  },
  {
    trigger: '!img',
    label: 'Responsive Image',
    description: 'รูปภาพแบบ responsive พร้อม figcaption',
    language: ['html'],
    body: `<figure class="image-wrapper">
  <img
    src="\${1:image.jpg}"
    alt="\${2:คำอธิบายรูป}"
    loading="lazy"
    width="\${3:800}"
    height="\${4:600}"
  >
  <figcaption>\${5:คำบรรยาย}</figcaption>
</figure>`,
  },

  // ── CSS ───────────────────────────────────────────────────
  {
    trigger: '!reset',
    label: 'CSS Reset',
    description: 'reset styles ทั้งหมด',
    language: ['css'],
    body: `*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  scroll-behavior: smooth;
}

body {
  font-family: 'Sarabun', sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #fff;
}

img, video {
  max-width: 100%;
  height: auto;
  display: block;
}

a {
  text-decoration: none;
  color: inherit;
}

ul, ol {
  list-style: none;
}`,
  },
  {
    trigger: '!flex',
    label: 'Flexbox Center',
    description: 'จัดกึ่งกลางด้วย flexbox',
    language: ['css'],
    body: `.\${1:container} {
  display: flex;
  align-items: center;
  justify-content: \${2:center};
  flex-wrap: wrap;
  gap: \${3:1rem};
}`,
  },
  {
    trigger: '!grid',
    label: 'CSS Grid',
    description: 'grid layout responsive auto-fit',
    language: ['css'],
    body: `.\${1:grid} {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(\${2:250px}, 1fr));
  gap: \${3:1.5rem};
  padding: \${4:1rem};
}`,
  },
  {
    trigger: '!card',
    label: 'Card Style',
    description: 'สไตล์การ์ดพร้อม hover effect',
    language: ['css'],
    body: `.\${1:card} {
  background: #fff;
  border-radius: \${2:12px};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: \${3:1.5rem};
  transition: transform 0.2s, box-shadow 0.2s;
}

.\${1:card}:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}`,
  },
  {
    trigger: '!btn',
    label: 'Button Style',
    description: 'สไตล์ปุ่มพร้อม hover + active',
    language: ['css'],
    body: `.\${1:btn} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: \${2:0.6rem 1.4rem};
  background: \${3:#6366f1};
  color: #fff;
  border: none;
  border-radius: \${4:8px};
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.\${1:btn}:hover  { background: \${5:#4f46e5}; }
.\${1:btn}:active { transform: scale(0.97); }`,
  },
  {
    trigger: '!dark',
    label: 'Dark Mode Variables',
    description: 'CSS variables สำหรับ dark/light mode',
    language: ['css'],
    body: `:root {
  --bg-primary:   #ffffff;
  --bg-secondary: #f4f4f5;
  --text-primary: #09090b;
  --text-muted:   #71717a;
  --accent:       #6366f1;
  --border:       #e4e4e7;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary:   #0f0f0f;
    --bg-secondary: #1a1a1a;
    --text-primary: #e4e4e7;
    --text-muted:   #a1a1aa;
    --accent:       #818cf8;
    --border:       #2a2a2a;
  }
}`,
  },
  {
    trigger: '!anim',
    label: 'Keyframe Animation',
    description: 'animation พร้อม @keyframes',
    language: ['css'],
    body: `@keyframes \${1:fadeIn} {
  from {
    opacity: 0;
    transform: translateY(\${2:20px});
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.\${3:element} {
  animation: \${1:fadeIn} \${4:0.4s} ease forwards;
}`,
  },
  {
    trigger: '!navbar',
    label: 'Navbar Style',
    description: 'สไตล์ navbar พร้อม sticky',
    language: ['css'],
    body: `.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: \${1:0.75rem 2rem};
  background: \${2:#1a1a1a};
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}

.nav-links {
  display: flex;
  gap: 1.5rem;
  list-style: none;
}

.nav-links a:hover {
  color: \${3:#6366f1};
  transition: color 0.2s;
}`,
  },

  // ── JavaScript ────────────────────────────────────────────
  {
    trigger: '!dom',
    label: 'DOM Ready',
    description: 'รอ DOM โหลดเสร็จก่อนรัน',
    language: ['javascript'],
    body: `document.addEventListener('DOMContentLoaded', () => {
  \${1:// โค้ดของคุณที่นี่}
});`,
  },
  {
    trigger: '!fetch',
    label: 'Fetch API',
    description: 'ดึงข้อมูลจาก REST API',
    language: ['javascript'],
    body: `async function \${1:fetchData}() {
  try {
    const response = await fetch('\${2:https://api.example.com/data}');

    if (!response.ok) {
      throw new Error(\`HTTP error: \${response.status}\`);
    }

    const data = await response.json();
    console.log(data);
    return data;

  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error);
  }
}

\${1:fetchData}();`,
  },
  {
    trigger: '!class',
    label: 'JavaScript Class',
    description: 'ES6 Class พร้อม constructor และ static method',
    language: ['javascript'],
    body: `class \${1:MyClass} {
  constructor(\${2:name}) {
    this.\${2:name} = \${2:name};
  }

  \${3:greet}() {
    return \`สวัสดี \${this.\${2:name}}!\`;
  }

  static \${4:create}(\${2:name}) {
    return new \${1:MyClass}(\${2:name});
  }
}

const \${5:obj} = new \${1:MyClass}('\${6:ทดสอบ}');
console.log(\${5:obj}.\${3:greet}());`,
  },
  {
    trigger: '!local',
    label: 'localStorage Helper',
    description: 'ฟังก์ชันช่วยจัดการ localStorage',
    language: ['javascript'],
    body: `const storage = {
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  remove(key) { localStorage.removeItem(key); },
  clear()     { localStorage.clear(); },
};

// ใช้งาน:
storage.set('\${1:user}', { name: '\${2:ชื่อ}' });
const \${1:user} = storage.get('\${1:user}');`,
  },
  {
    trigger: '!toggle',
    label: 'Toggle Dark Mode',
    description: 'toggle dark/light mode + localStorage',
    language: ['javascript'],
    body: `const btn = document.querySelector('\${1:#toggleBtn}');
const root = document.documentElement;

// โหลดธีมที่บันทึกไว้
if (localStorage.getItem('theme') === 'dark') {
  root.classList.add('dark');
}

btn.addEventListener('click', () => {
  root.classList.toggle('dark');
  const isDark = root.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});`,
  },

  // ── Python ────────────────────────────────────────────────
  {
    trigger: '!main',
    label: 'Python Main Block',
    description: 'โครงสร้าง main ของ Python',
    language: ['python'],
    body: `def main():
    """\${1:คำอธิบายโปรแกรม}"""
    \${2:print("สวัสดีโลก!")}


if __name__ == "__main__":
    main()`,
  },
  {
    trigger: '!class',
    label: 'Python Class',
    description: 'Class พร้อม __init__, __repr__ และ method',
    language: ['python'],
    body: `class \${1:MyClass}:
    """\${2:คำอธิบาย class}"""

    def __init__(self, \${3:name}: str):
        self.\${3:name} = \${3:name}

    def __repr__(self) -> str:
        return f"\${1:MyClass}(\${3:name}={self.\${3:name}!r})"

    def \${4:greet}(self) -> str:
        return f"สวัสดี {self.\${3:name}}!"


\${5:obj} = \${1:MyClass}("\${6:ทดสอบ}")
print(\${5:obj}.\${4:greet}())`,
  },
  {
    trigger: '!try',
    label: 'Try/Except Block',
    description: 'จัดการ exception แบบครบ',
    language: ['python'],
    body: `try:
    \${1:# โค้ดที่อาจเกิด error}
    result = \${2:some_function()}

except \${3:ValueError} as e:
    print(f"ข้อผิดพลาด: {e}")

except Exception as e:
    print(f"เกิดข้อผิดพลาดที่ไม่คาดคิด: {e}")

else:
    print(f"สำเร็จ: {result}")

finally:
    print("เสร็จสิ้น")`,
  },
  {
    trigger: '!read',
    label: 'Read/Write File',
    description: 'อ่านและเขียนไฟล์ด้วย context manager',
    language: ['python'],
    body: `# อ่านไฟล์
with open("\${1:input.txt}", "r", encoding="utf-8") as f:
    content = f.read()
    print(content)

# เขียนไฟล์
with open("\${2:output.txt}", "w", encoding="utf-8") as f:
    f.write("\${3:เนื้อหาที่ต้องการเขียน}\\n")`,
  },
  {
    trigger: '!list',
    label: 'List Comprehension',
    description: 'List comprehension แบบต่างๆ',
    language: ['python'],
    body: `# List comprehension พื้นฐาน
\${1:squares} = [\${2:x}**2 for \${2:x} in range(\${3:10})]

# พร้อม condition
\${4:evens} = [\${2:x} for \${2:x} in range(\${3:10}) if \${2:x} % 2 == 0]

print(\${1:squares})
print(\${4:evens})`,
  },

  // ── C ─────────────────────────────────────────────────────
  {
    trigger: '!',
    label: 'C Main Template',
    description: 'โครงสร้างโปรแกรม C มาตรฐาน',
    language: ['c'],
    body: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    \${1:/* โค้ดของคุณที่นี่ */}
    printf("\${2:สวัสดีโลก!}\\n");

    return 0;
}`,
  },
  {
    trigger: '!func',
    label: 'C Function',
    description: 'ฟังก์ชัน C พร้อม prototype',
    language: ['c'],
    body: `/* Prototype */
\${1:int} \${2:myFunction}(\${3:int param});

/* Implementation */
\${1:int} \${2:myFunction}(\${3:int param}) {
    \${4:/* โค้ด */}
    return \${5:0};
}`,
  },
  {
    trigger: '!for',
    label: 'For Loop',
    description: 'วนซ้ำ for loop มาตรฐาน',
    language: ['c'],
    body: `for (int \${1:i} = 0; \${1:i} < \${2:n}; \${1:i}++) {
    \${3:/* โค้ด */}
}`,
  },
  {
    trigger: '!arr',
    label: 'Array Declaration',
    description: 'ประกาศ array และแสดงผลด้วย loop',
    language: ['c'],
    body: `int \${1:arr}[\${2:10}] = {\${3:0}};
int \${1:arr}_len = sizeof(\${1:arr}) / sizeof(\${1:arr}[0]);

for (int i = 0; i < \${1:arr}_len; i++) {
    printf("%d\\n", \${1:arr}[i]);
}`,
  },
  {
    trigger: '!struct',
    label: 'Struct Definition',
    description: 'กำหนด struct พร้อมใช้งาน',
    language: ['c'],
    body: `typedef struct {
    \${1:char name[50]};
    \${2:int age};
} \${3:Person};

\${3:Person} \${4:p1};
\${4:p1}.\${1:name[0]} = '\\0'; /* ตั้งค่าผ่าน strcpy */
\${4:p1}.\${2:age} = \${5:0};
printf("อายุ: %d\\n", \${4:p1}.\${2:age});`,
  },

  // ── C++ ───────────────────────────────────────────────────
  {
    trigger: '!',
    label: 'C++ Main Template',
    description: 'โครงสร้างโปรแกรม C++ มาตรฐาน',
    language: ['cpp'],
    body: `#include <iostream>
#include <vector>
#include <string>

using namespace std;

int main() {
    \${1:// โค้ดของคุณที่นี่}
    cout << "\${2:สวัสดีโลก!}" << endl;

    return 0;
}`,
  },
  {
    trigger: '!class',
    label: 'C++ Class',
    description: 'Class C++ พร้อม constructor, destructor, getter',
    language: ['cpp'],
    body: `class \${1:MyClass} {
private:
    \${2:string name};

public:
    \${1:MyClass}(\${2:string} \${3:n}) : \${2:name}(\${3:n}) {}
    ~\${1:MyClass}() = default;

    \${2:string} get\${4:Name}() const { return \${2:name}; }

    void \${5:greet}() const {
        cout << "สวัสดี " << \${2:name} << "!" << endl;
    }
};

int main() {
    \${1:MyClass} \${6:obj}("\${7:ทดสอบ}");
    \${6:obj}.\${5:greet}();
    return 0;
}`,
  },
  {
    trigger: '!vec',
    label: 'Vector Operations',
    description: 'ใช้งาน vector ใน C++ แบบครบ',
    language: ['cpp'],
    body: `vector<\${1:int}> \${2:nums} = {\${3:1, 2, 3, 4, 5}};

// range-based for
for (const auto& \${4:n} : \${2:nums}) {
    cout << \${4:n} << " ";
}
cout << endl;

\${2:nums}.push_back(\${5:6});
cout << "ขนาด: " << \${2:nums}.size() << endl;`,
  },
  {
    trigger: '!for',
    label: 'Range-Based For',
    description: 'วนซ้ำด้วย range-based for loop',
    language: ['cpp'],
    body: `for (const auto& \${1:item} : \${2:container}) {
    \${3:cout << item << endl;}
}`,
  },
  {
    trigger: '!lambda',
    label: 'Lambda Function',
    description: 'lambda expression ใน C++',
    language: ['cpp'],
    body: `auto \${1:func} = [\${2:}](\${3:int x}) -> \${4:int} {
    return \${5:x * 2};
};

cout << \${1:func}(\${6:5}) << endl;`,
  },
];

// ────────────────────────────────────────────────────────────
// Monaco language map
// ────────────────────────────────────────────────────────────
const LANG_MAP: Record<string, string[]> = {
  html:       ['html'],
  css:        ['css'],
  javascript: ['javascript'],
  typescript: ['javascript', 'typescript'],
  python:     ['python'],
  c:          ['c'],
  cpp:        ['cpp'],
};

function getSnippetsForLang(monacoLang: string, extras: Snippet[] = []): Snippet[] {
  const targets = LANG_MAP[monacoLang] ?? [monacoLang];
  return [...BUILTIN_SNIPPETS, ...extras].filter((s) =>
    s.language.some((l) => targets.includes(l) || l === 'all')
  );
}

// ────────────────────────────────────────────────────────────
// Tab-stop cursor placement helper
// ────────────────────────────────────────────────────────────
type IRange = {
  startLineNumber: number; startColumn: number;
  endLineNumber: number;   endColumn: number;
};
type IPosition = { lineNumber: number; column: number };

// ────────────────────────────────────────────────────────────
// Multi-language Shorthands Definition
// ────────────────────────────────────────────────────────────
export const SHORTHANDS: Record<string, Record<string, string>> = {
  python: {
    p: 'print($1)',
    pr: 'print($1)',
    df: 'def ${1:name}(${2:params}):\n\t${3:pass}',
    def: 'def ${1:name}(${2:params}):\n\t${3:pass}',
    if: 'if ${1:condition}:\n\t${2:pass}',
    el: 'else:\n\t${1:pass}',
    ei: 'elif ${1:condition}:\n\t${2:pass}',
    for: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}',
    fr: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}',
    wh: 'while ${1:condition}:\n\t${2:pass}',
    im: 'import ${1:module}',
    fim: 'from ${1:module} import ${2:name}',
    cl: 'class ${1:ClassName}:\n\tdef __init__(self):\n\t\t${2:pass}',
    ret: 'return ${1:value}',
    try: 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${3:pass}',
    main: 'if __name__ == "__main__":\n\t${1:main()}',
  },
  c: {
    inc: '#include <${1:stdio.h}>',
    main: 'int main(void) {\n\t${1:}\n\treturn 0;\n}',
    pr: 'printf("${1:%d}\\n", ${2:var});',
    for: 'for (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t${3:}\n}',
    if: 'if (${1:condition}) {\n\t${2:}\n}',
    el: 'else {\n\t${1:}\n}',
    ret: 'return ${1:0};',
    fn: '${1:void} ${2:name}(${3:void}) {\n\t${4:}\n}',
    struct: 'struct ${1:Name} {\n\t${2:}\n};',
    wh: 'while (${1:condition}) {\n\t${2:}\n}',
  },
  cpp: {
    inc: '#include <${1:iostream}>',
    main: 'int main() {\n\t${1:}\n\treturn 0;\n}',
    co: 'std::cout << ${1:value} << std::endl;',
    ci: 'std::cin >> ${1:var};',
    vec: 'std::vector<${1:int}> ${2:name};',
    for: 'for (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t${3:}\n}',
    fore: 'for (const auto& ${1:item} : ${2:container}) {\n\t${3:}\n}',
    if: 'if (${1:condition}) {\n\t${2:}\n}',
    el: 'else {\n\t${1:}\n}',
    ret: 'return ${1:0};',
    fn: '${1:void} ${2:name}(${3:}) {\n\t${4:}\n}',
    cl: 'class ${1:ClassName} {\nprivate:\npublic:\n\t${1:ClassName}() = default;\n};',
    struct: 'struct ${1:Name} {\n\t${2:}\n};',
  }
};

function isJsxOrHtmlContext(model: any, position: IPosition): boolean {
  const lineContent = model.getLineContent(position.lineNumber);
  const textBefore = lineContent.substring(0, position.column - 1);
  const trimmedBefore = textBefore.trim();
  
  if (trimmedBefore.endsWith('<') || /<[a-zA-Z0-9_-]*$/.test(trimmedBefore)) {
    return true;
  }
  
  // Scan preceding lines for JSX clues
  let isReturnBlock = false;
  const startLine = Math.max(1, position.lineNumber - 15);
  for (let l = position.lineNumber; l >= startLine; l--) {
    const content = model.getLineContent(l);
    if (content.includes('return (') || content.includes('return <') || content.trim().startsWith('<')) {
      isReturnBlock = true;
      break;
    }
  }
  return isReturnBlock;
}

// ────────────────────────────────────────────────────────────
// HTML Emmet tags and helpers
// ────────────────────────────────────────────────────────────

const HTML_TAGS = [
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi',
  'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code',
  'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog',
  'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i',
  'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main',
  'map', 'mark', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup',
  'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span',
  'strong', 'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td',
  'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track',
  'u', 'ul', 'var', 'video', 'wbr'
];

const HTML_TAGS_SET = new Set(HTML_TAGS);

/** HTML void (self-closing) tags — ไม่ต้องมี closing tag */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function getInsertTextForTag(tag: string): string {
  const t = tag.toLowerCase();
  if (t === 'img') return '<img src="${1:}" alt="${2:}" />';
  if (t === 'input') return '<input type="${1:text}" name="${2:}" id="${3:}" />';
  if (t === 'link') return '<link rel="stylesheet" href="${1:}" />';
  if (t === 'meta') return '<meta charset="UTF-8" />';
  if (t === 'br') return '<br>';
  if (t === 'hr') return '<hr>';
  if (VOID_TAGS.has(t)) return `<${t} />`;

  if (t === 'table') return '<table>\n\t$1\n</table>';
  if (t === 'ul') return '<ul>\n\t$1\n</ul>';
  if (t === 'ol') return '<ol>\n\t$1\n</ol>';
  if (t === 'select') return '<select name="${1:}" id="${2:}">\n\t$3\n</select>';
  if (t === 'form') return '<form action="${1:}" method="${2:post}">\n\t$3\n</form>';
  if (t === 'head') return '<head>\n\t$1\n</head>';
  if (t === 'html') return '<html>\n\t$1\n</html>';
  if (t === 'body') return '<body>\n\t$1\n</body>';
  
  if (t === 'a') return '<a href="${1:#}">$2</a>';
  if (t === 'script') return '<script src="${1:}"></script>';
  if (t === 'style') return '<style>\n\t$1\n</style>';
  if (t === 'button') return '<button type="${1:button}">$2</button>';
  if (t === 'label') return '<label for="${1:}">$2</label>';
  if (t === 'textarea') return '<textarea name="${1:}" id="${2:}" cols="${3:30}" rows="${4:10}">$5</textarea>';
  if (t === 'iframe') return '<iframe src="${1:}" frameborder="0"></iframe>';
  
  return `<${t}>$1</${t}>`;
}

// ────────────────────────────────────────────────────────────
// Register Monaco CompletionItemProvider for ONE language
// Call once per (monaco, language) pair.
// ────────────────────────────────────────────────────────────
const _registered = new Set<string>();

export function registerCompletionProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monacoInstance: any,
  monacoLang: string,
  getCustomSnippets: () => Snippet[] = () => []
): void {
  const key = `${monacoLang}`;
  if (_registered.has(key)) return;
  _registered.add(key);

  // 1. ! snippet completion item provider
  monacoInstance.languages.registerCompletionItemProvider(monacoLang, {
    triggerCharacters: ['!'],

    provideCompletionItems(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: any, position: IPosition
    ) {
      const lineContent: string = model.getLineContent(position.lineNumber);
      const textBefore = lineContent.substring(0, position.column - 1);

      if (!textBefore.includes('!')) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range: IRange = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      const snippets = getSnippetsForLang(monacoLang, getCustomSnippets());

      const bangIndex = textBefore.lastIndexOf('!');
      const typed = bangIndex >= 0 ? textBefore.slice(bangIndex) : '';

      const filtered = typed.length > 1
        ? snippets.filter((s) => s.trigger.startsWith(typed) || typed.startsWith(s.trigger))
        : snippets;

      return {
        suggestions: filtered.map((s) => ({
          label:     s.trigger,
          kind:      monacoInstance.languages.CompletionItemKind.Snippet,
          detail:    s.label,
          documentation: { value: `**${s.label}**\n\n${s.description}` },
          insertText: s.body,
          insertTextRules:
            monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          filterText: s.trigger,
          sortText: '0' + s.trigger, // show snippets first
          range: {
            ...range,
            startColumn: bangIndex + 1,
          },
        })),
      };
    },
  });

  // 2. HTML Tag and Shorthand completion (for HTML/JS/TS web files)
  const isWebLang = ['html', 'htm', 'javascript', 'typescript'].includes(monacoLang);
  if (isWebLang) {
    monacoInstance.languages.registerCompletionItemProvider(monacoLang, {
      provideCompletionItems(model: any, position: IPosition) {
        if ((monacoLang === 'javascript' || monacoLang === 'typescript') && !isJsxOrHtmlContext(model, position)) {
          return { suggestions: [] };
        }

        const lineContent: string = model.getLineContent(position.lineNumber);
        const textBefore = lineContent.substring(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const currentTyped = word.word.toLowerCase();

        if (!currentTyped) return { suggestions: [] };

        const hasLeftBracket = textBefore.trimEnd().endsWith('<' + word.word) || textBefore.endsWith('<');
        const startCol = hasLeftBracket
          ? Math.max(1, position.column - currentTyped.length - 1)
          : word.startColumn;

        const suggestions: any[] = [];

        // Add Shorthand Suggestions (priority 000_)
        for (const key in TAG_SHORTHANDS) {
          if (key.startsWith(currentTyped)) {
            const targetTag = TAG_SHORTHANDS[key];
            const insertText = getInsertTextForTag(targetTag);
            suggestions.push({
              label: key,
              kind: monacoInstance.languages.CompletionItemKind.Snippet,
              detail: `Shorthand for <${targetTag}>`,
              documentation: {
                value: `Expand to \`${insertText.replace(/\$\d+|\$\{\d+:?([^}]*)\}/g, '$1')}\``,
              },
              insertText: insertText,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              filterText: hasLeftBracket ? '<' + key : key,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: startCol,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
              },
              sortText: '000_' + key,
            });
          }
        }

        // Add standard HTML tag suggestions (priority 00_)
        const matchedTags = HTML_TAGS.filter((tag) => tag.startsWith(currentTyped));
        for (const tag of matchedTags) {
          if (suggestions.some(s => s.label === tag)) continue;
          
          const insertText = getInsertTextForTag(tag);
          suggestions.push({
            label: tag,
            kind: monacoInstance.languages.CompletionItemKind.Snippet,
            detail: `HTML <${tag}> Tag`,
            documentation: {
              value: `Expand to \`${insertText.replace(/\$\d+|\$\{\d+:?([^}]*)\}/g, '$1')}\``,
            },
            insertText: insertText,
            insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            filterText: hasLeftBracket ? '<' + tag : tag,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: startCol,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            },
            sortText: '00_' + tag,
          });
        }

        return { suggestions };
      },
    });
  }

  // 3. Shorthand completion for other languages (python, c, cpp)
  const langShorthands = SHORTHANDS[monacoLang];
  if (langShorthands) {
    monacoInstance.languages.registerCompletionItemProvider(monacoLang, {
      provideCompletionItems(model: any, position: IPosition) {
        const word = model.getWordUntilPosition(position);
        const currentTyped = word.word.toLowerCase();
        if (!currentTyped) return { suggestions: [] };

        const suggestions: any[] = [];
        for (const key in langShorthands) {
          if (key.startsWith(currentTyped)) {
            const body = langShorthands[key];
            suggestions.push({
              label: key,
              kind: monacoInstance.languages.CompletionItemKind.Snippet,
              detail: `Shorthand for ${key}`,
              documentation: {
                value: `Expand to:\n\`\`\`${monacoLang}\n${body}\n\`\`\``,
              },
              insertText: body,
              insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
              },
              sortText: '00_' + key,
            });
          }
        }
        return { suggestions };
      },
    });
  }
}

// ────────────────────────────────────────────────────────────
// Tab-key expansion — call once per editor instance
// ────────────────────────────────────────────────────────────

export function registerTabExpansion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monacoInstance: any,
  monacoLang: string,
  getCustomSnippets: () => Snippet[] = () => []
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.onKeyDown((e: any) => {
    // Tab key = keyCode 2 in Monaco's KeyCode enum
    if (e.keyCode !== 2) return;
    // Skip modified Tab
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    const selection = editor.getSelection();
    // Don't expand when text is selected (user wants to indent block)
    if (selection && !selection.isEmpty()) return;

    // ตรวจสอบว่า Suggestion Box (Autocomplete) เปิดอยู่หรือไม่
    // ถ้าเปิดอยู่ ให้ข้ามการกด Tab เพื่อให้ระบบเลือกจากลิสต์แทนการทำ Tab-expansion
    let isSuggestionOpen = false;
    const suggestController = editor.getContribution('editor.contrib.suggestController') as any;
    if (suggestController) {
      const widget = suggestController._widget || suggestController.widget;
      if (widget) {
        const widgetVal = widget.value || widget;
        if (widgetVal) {
          if (typeof widgetVal.isVisible === 'function') {
            isSuggestionOpen = widgetVal.isVisible();
          } else if (typeof widgetVal.visible === 'boolean') {
            isSuggestionOpen = widgetVal.visible;
          } else if (widgetVal.raw && typeof widgetVal.raw.visible === 'boolean') {
            isSuggestionOpen = widgetVal.raw.visible;
          }
        }
      }
    }
    if (isSuggestionOpen) return;

    const position: IPosition = editor.getPosition();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model: any = editor.getModel();
    if (!position || !model) return;

    const lineContent: string = model.getLineContent(position.lineNumber);
    const textBefore = lineContent.substring(0, position.column - 1);
    const trimmedBefore = textBefore.trim();

    // ── 1. Web Emmet / Shorthand Expansion ─────────────────
    const isWebLang = ['html', 'htm', 'javascript', 'typescript'].includes(monacoLang);
    if (isWebLang) {
      const shouldExpand = !['javascript', 'typescript'].includes(monacoLang) || isJsxOrHtmlContext(model, position);

      if (shouldExpand) {
        const match = textBefore.match(/([a-zA-Z0-9.#>+*\-_]+)$/);
        if (match) {
          const expr = match[1];
          let hasLeftBracket = false;
          let cleanExpr = expr;
          const matchWithBracket = textBefore.match(/<([a-zA-Z0-9.#>+*\-_]+)$/);
          if (matchWithBracket) {
            hasLeftBracket = true;
            cleanExpr = matchWithBracket[1];
          }

          const { body, isValid } = expandEmmet(cleanExpr);
          if (isValid && body) {
            e.preventDefault();
            e.stopPropagation();

            const ctrl = editor.getContribution('snippetController2') as any;
            const overwriteLen = hasLeftBracket ? cleanExpr.length + 1 : cleanExpr.length;
            if (ctrl?.insert) {
              ctrl.insert(body, { overwriteBefore: overwriteLen });
            } else {
              const range: IRange = {
                startLineNumber: position.lineNumber,
                startColumn: position.column - overwriteLen,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              };
              editor.executeEdits('emmet', [{ range, text: body.replace(/\$\d+|\$\{\d+:?([^}]*)\}/g, '$1') }]);
            }
            return;
          }
        }
      }
    }

    // ── 2. Other Languages Shorthands Expansion ──────────
    const langShorthands = SHORTHANDS[monacoLang];
    if (langShorthands) {
      const match = textBefore.match(/([a-zA-Z0-9_]+)$/);
      if (match) {
        const word = match[1];
        if (langShorthands[word]) {
          e.preventDefault();
          e.stopPropagation();

          const ctrl = editor.getContribution('snippetController2') as any;
          if (ctrl?.insert) {
            ctrl.insert(langShorthands[word], { overwriteBefore: word.length });
          } else {
            const range: IRange = {
              startLineNumber: position.lineNumber,
              startColumn: position.column - word.length,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            };
            editor.executeEdits('shorthand', [{ range, text: langShorthands[word].replace(/\$\d+|\$\{\d+:?([^}]*)\}/g, '$1') }]);
          }
          return;
        }
      }
    }

    // ── 3. !snippet trigger ────────────────────────────
    const snippets = getSnippetsForLang(monacoLang, getCustomSnippets());

    // Find the longest matching trigger
    const matched = snippets
      .filter((s) => trimmedBefore === s.trigger || trimmedBefore.endsWith(s.trigger))
      .sort((a, b) => b.trigger.length - a.trigger.length)[0];

    if (!matched) return;

    e.preventDefault();
    e.stopPropagation();

    // Use Monaco's snippetController2 for proper tab-stop navigation
    const ctrl = editor.getContribution('snippetController2') as any;
    if (ctrl?.insert) {
      ctrl.insert(matched.body, { overwriteBefore: matched.trigger.length });
    } else {
      // Fallback: plain insertion (no tab stops)
      const range: IRange = {
        startLineNumber: position.lineNumber,
        startColumn: position.column - matched.trigger.length,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };
      const plainText = matched.body
        .replace(/\$\{\d+:([^}]*)\}/g, '$1')
        .replace(/\$\d+/g, '');
      editor.executeEdits('snippet', [{ range, text: plainText }]);
    }
  });
}

// ────────────────────────────────────────────────────────────
// Insert snippet at cursor programmatically (from CheatSheet)
// ────────────────────────────────────────────────────────────
export function insertSnippetAtCursor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any,
  body: string
): void {
  if (!editor) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctrl = editor.getContribution('snippetController2') as any;
  if (ctrl?.insert) {
    ctrl.insert(body);
  } else {
    const plain = body
      .replace(/\$\{\d+:([^}]*)\}/g, '$1')
      .replace(/\$\d+/g, '');
    editor.trigger('', 'type', { text: plain });
  }
}
