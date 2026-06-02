export const TAG_SHORTHANDS: Record<string, string> = {
  d: 'div',
  s: 'span',
  p: 'p',
  a: 'a',
  btn: 'button',
  inp: 'input',
  lbl: 'label',
  i: 'img',
  img: 'img',
  sect: 'section',
  art: 'article',
  nav: 'nav',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  f: 'form',
  form: 'form',
  tbl: 'table',
  txd: 'textarea',
  area: 'textarea',
  sel: 'select',
  opt: 'option',
  c: 'code',
  cd: 'code',
  scr: 'script',
  sty: 'style',
};

export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

interface EmmetNode {
  tag: string;
  id: string;
  classes: string[];
  multiplier: number;
  children: EmmetNode[];
}

export function isValidEmmet(str: string): boolean {
  if (!str || /\s/.test(str)) return false;
  // Allow alphanumeric, ., #, >, +, *, -, _
  if (!/^[a-zA-Z0-9.#>+*\-_]+$/.test(str)) return false;
  // Operators shouldn't be consecutive, leading, or trailing
  if (/^[>+*]/.test(str) || /[>+*]$/.test(str) || /[>+*]{2,}/.test(str)) return false;
  // Class/ID names shouldn't be empty
  if (/\.[.>+#*]/.test(str) || /#[.>+#*]/.test(str) || /\.$/.test(str) || /#$/.test(str)) return false;
  return true;
}

function tokenize(str: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '>' || char === '+' || char === '*' || char === '.' || char === '#') {
      tokens.push(char);
      i++;
    } else {
      let start = i;
      while (i < str.length && !['>', '+', '*', '.', '#'].includes(str[i])) {
        i++;
      }
      tokens.push(str.slice(start, i));
    }
  }
  return tokens;
}

function parseNodes(tokens: string[]): EmmetNode[] {
  if (tokens.length === 0) return [];
  
  let i = 0;
  let tag = '';
  // Check if first token is an operator/modifier
  if (tokens[i] !== '.' && tokens[i] !== '#' && tokens[i] !== '>' && tokens[i] !== '+' && tokens[i] !== '*') {
    tag = tokens[i];
    i++;
  }
  
  let id = '';
  const classes: string[] = [];
  let multiplier = 1;
  
  while (i < tokens.length) {
    if (tokens[i] === '.') {
      i++;
      if (i < tokens.length) {
        classes.push(tokens[i]);
        i++;
      }
    } else if (tokens[i] === '#') {
      i++;
      if (i < tokens.length) {
        id = tokens[i];
        i++;
      }
    } else if (tokens[i] === '*') {
      i++;
      if (i < tokens.length) {
        const val = parseInt(tokens[i], 10);
        if (!isNaN(val)) {
          multiplier = val;
        }
        i++;
      }
    } else {
      break;
    }
  }
  
  // Default to div if empty tag name but class/id is present
  if (!tag && (classes.length > 0 || id)) {
    tag = 'div';
  }
  
  if (!tag) {
    return [];
  }
  
  const node: EmmetNode = {
    tag,
    id,
    classes,
    multiplier,
    children: []
  };
  
  const result: EmmetNode[] = [node];
  
  if (i < tokens.length) {
    const op = tokens[i];
    i++;
    const nextTokens = tokens.slice(i);
    if (op === '>') {
      node.children = parseNodes(nextTokens);
    } else if (op === '+') {
      result.push(...parseNodes(nextTokens));
    }
  }
  
  return result;
}

export function expandEmmet(abbreviation: string): { body: string; isValid: boolean } {
  if (!isValidEmmet(abbreviation)) {
    return { body: '', isValid: false };
  }
  
  try {
    const tokens = tokenize(abbreviation);
    const nodes = parseNodes(tokens);
    if (nodes.length === 0) {
      return { body: '', isValid: false };
    }
    
    let tabStopIndex = 1;
    
    function renderNode(node: EmmetNode, indent = ''): string {
      const tag = TAG_SHORTHANDS[node.tag.toLowerCase()] || node.tag;
      const lowerTag = tag.toLowerCase();
      
      let attrs = '';
      if (node.id) {
        attrs += ` id="${node.id}"`;
      }
      if (node.classes.length > 0) {
        attrs += ` class="${node.classes.join(' ')}"`;
      }
      
      // Suffix default attributes for specific tags
      if (lowerTag === 'a' && !attrs.includes('href=')) {
        attrs += ` href="\${${tabStopIndex++}:#}"`;
      } else if (lowerTag === 'img' && !attrs.includes('src=')) {
        attrs += ` src="\${${tabStopIndex++}:}" alt="\${${tabStopIndex++}:}"`;
      } else if (lowerTag === 'input' && !attrs.includes('type=')) {
        attrs += ` type="\${${tabStopIndex++}:text}" name="\${${tabStopIndex++}:}" id="\${${tabStopIndex++}:}"`;
      } else if (lowerTag === 'button' && !attrs.includes('type=')) {
        attrs += ` type="\${${tabStopIndex++}:button}"`;
      } else if (lowerTag === 'link') {
        attrs += ` rel="stylesheet" href="\${${tabStopIndex++}:}"`;
      } else if (lowerTag === 'meta') {
        attrs += ` charset="UTF-8"`;
      } else if (lowerTag === 'textarea') {
        attrs += ` name="\${${tabStopIndex++}:}" id="\${${tabStopIndex++}:}" cols="30" rows="10"`;
      }
      
      const isVoid = VOID_TAGS.has(lowerTag);
      
      let content = '';
      if (node.children.length > 0) {
        const childContent = node.children.map(c => renderNode(c, indent + '\t')).join('\n');
        content = `\n${childContent}\n${indent}`;
      } else if (!isVoid) {
        content = `\${${tabStopIndex++}}`;
      }
      
      let result = '';
      if (isVoid) {
        if (lowerTag === 'br' || lowerTag === 'hr') {
          result = `<${lowerTag}>`;
        } else {
          result = `<${lowerTag}${attrs} />`;
        }
      } else {
        result = `<${lowerTag}${attrs}>${content}</${lowerTag}>`;
      }
      
      let repeated = '';
      for (let m = 0; m < node.multiplier; m++) {
        if (repeated) repeated += '\n' + indent;
        repeated += result;
      }
      
      return repeated;
    }
    
    const body = nodes.map(n => renderNode(n)).join('\n');
    return { body, isValid: true };
  } catch (err) {
    console.error('Emmet expansion error:', err);
    return { body: '', isValid: false };
  }
}
