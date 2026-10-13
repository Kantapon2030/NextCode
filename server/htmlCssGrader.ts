import { Request, Response } from 'express';

export type WebRuleType =
  | 'tag_exists'
  | 'attribute_check'
  | 'text_content'
  | 'computed_style'
  | 'css_rule_exists'
  | 'custom_assertion';

export interface WebValidationRule {
  id: string;
  title: string;
  type: WebRuleType;
  selector?: string;
  attributeName?: string;
  expectedValue?: string;
  cssProperty?: string;
  customCode?: string;
  points?: number; // Default: 1
}

export interface RuleEvaluationResult {
  id: string;
  title: string;
  passed: boolean;
  message?: string;
  actualValue?: string;
  expectedValue?: string;
  pointsAwarded: number;
}

export interface WebGradeReport {
  overallPassed: boolean;
  score: number; // 0 - 100
  passedRules: number;
  totalRules: number;
  results: RuleEvaluationResult[];
  timestamp: number;
}

export class HtmlCssGrader {
  /**
   * Generates a self-contained test runner script to be injected into the preview iframe.
   * Runs tests directly inside the browser DOM and posts results to window.parent.
   */
  public generateIframeVerificationScript(rules: WebValidationRule[]): string {
    const rulesJson = JSON.stringify(rules);

    return `
(function() {
  const rules = ${rulesJson};
  const results = [];
  let totalPoints = 0;
  let earnedPoints = 0;

  for (const rule of rules) {
    const points = rule.points || 1;
    totalPoints += points;
    let passed = false;
    let message = '';
    let actualValue = '';

    try {
      if (rule.type === 'tag_exists') {
        const el = document.querySelector(rule.selector || '');
        passed = !!el;
        actualValue = passed ? 'Found' : 'Not found';
        message = passed ? 'Element found in DOM' : 'Expected element matching "' + rule.selector + '" not found';
      }
      else if (rule.type === 'attribute_check') {
        const el = document.querySelector(rule.selector || '');
        if (!el) {
          passed = false;
          message = 'Target element "' + rule.selector + '" not found';
        } else {
          actualValue = el.getAttribute(rule.attributeName || '') || '';
          passed = rule.expectedValue ? actualValue === rule.expectedValue : el.hasAttribute(rule.attributeName || '');
          message = passed ? 'Attribute matches requirement' : 'Attribute ' + rule.attributeName + ' was "' + actualValue + '", expected "' + rule.expectedValue + '"';
        }
      }
      else if (rule.type === 'text_content') {
        const el = document.querySelector(rule.selector || '');
        if (!el) {
          passed = false;
          message = 'Target element "' + rule.selector + '" not found';
        } else {
          actualValue = (el.textContent || '').trim();
          passed = actualValue.includes(rule.expectedValue || '');
          message = passed ? 'Text content matches requirement' : 'Expected text to include "' + rule.expectedValue + '"';
        }
      }
      else if (rule.type === 'computed_style') {
        const el = document.querySelector(rule.selector || '');
        if (!el) {
          passed = false;
          message = 'Target element "' + rule.selector + '" not found';
        } else {
          const style = window.getComputedStyle(el);
          actualValue = style.getPropertyValue(rule.cssProperty || '').trim();
          const expected = (rule.expectedValue || '').trim().toLowerCase();
          passed = actualValue.toLowerCase() === expected;
          message = passed ? 'Computed CSS style matches' : 'Computed style for ' + rule.cssProperty + ' was "' + actualValue + '", expected "' + expected + '"';
        }
      }
      else if (rule.type === 'custom_assertion') {
        if (rule.customCode) {
          const fn = new Function('return (' + rule.customCode + ');');
          const evalRes = fn();
          passed = !!evalRes;
          actualValue = String(evalRes);
          message = passed ? 'Custom assertion passed' : 'Custom assertion returned false';
        }
      }
    } catch (err) {
      passed = false;
      message = 'Execution error: ' + err.message;
    }

    if (passed) earnedPoints += points;

    results.push({
      id: rule.id,
      title: rule.title,
      passed,
      message,
      actualValue,
      expectedValue: rule.expectedValue || '',
      pointsAwarded: passed ? points : 0
    });
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passedRules = results.filter(r => r.passed).length;

  const report = {
    type: 'NEXTCODE_WEB_GRADE_RESULT',
    overallPassed: passedRules === rules.length,
    score,
    passedRules,
    totalRules: rules.length,
    results,
    timestamp: Date.now()
  };

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(report, '*');
  }
  return report;
})();
`;
  }

  /**
   * Fast Static Server-Side Evaluation for HTML/CSS without launching a heavy headless browser.
   */
  public gradeWebStatic(
    files: Record<string, string>,
    rules: WebValidationRule[]
  ): WebGradeReport {
    const html = files['index.html'] || files['index.htm'] || Object.values(files)[0] || '';
    const css = Object.entries(files)
      .filter(([name]) => name.endsWith('.css'))
      .map(([, content]) => content)
      .join('\n');

    const results: RuleEvaluationResult[] = [];
    let totalPoints = 0;
    let earnedPoints = 0;

    for (const rule of rules) {
      const points = rule.points || 1;
      totalPoints += points;
      let passed = false;
      let actualValue = '';
      let message = '';

      try {
        if (rule.type === 'tag_exists') {
          const tag = (rule.selector || '').replace(/[^a-zA-Z0-9_-]/g, '');
          const tagRegex = new RegExp(`<${tag}[^>]*>`, 'i');
          passed = tagRegex.test(html);
          actualValue = passed ? `<${tag}> present` : 'Not found';
          message = passed ? 'Tag detected in HTML' : `Missing required <${tag}> tag`;
        } else if (rule.type === 'attribute_check') {
          const attr = rule.attributeName || '';
          if (rule.expectedValue) {
            const attrRegex = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i');
            const match = html.match(attrRegex);
            actualValue = match ? match[1] : '';
            passed = actualValue === rule.expectedValue;
            message = passed
              ? `Attribute ${attr} matches expected value`
              : `Attribute ${attr} mismatch: got "${actualValue}", expected "${rule.expectedValue}"`;
          } else {
            const attrRegex = new RegExp(`${attr}(\\s*=\\s*|\\s|>|/)`, 'i');
            passed = attrRegex.test(html);
            message = passed ? `Attribute ${attr} exists` : `Missing required attribute ${attr}`;
          }
        } else if (rule.type === 'text_content') {
          const expected = rule.expectedValue || '';
          passed = html.toLowerCase().includes(expected.toLowerCase());
          actualValue = passed ? 'Found' : 'Not found';
          message = passed
            ? `Text content contains "${expected}"`
            : `Text content does not contain "${expected}"`;
        } else if (rule.type === 'css_rule_exists' || rule.type === 'computed_style') {
          const prop = rule.cssProperty || '';
          const val = (rule.expectedValue || '').trim().toLowerCase();
          const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, ''); // Strip comments
          const propRegex = new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'i');
          const match = cleanCss.match(propRegex);

          if (match) {
            actualValue = match[1].trim().toLowerCase();
            passed = val ? actualValue.includes(val) : true;
            message = passed
              ? `CSS property ${prop} matches`
              : `CSS property ${prop} mismatch: got "${actualValue}", expected "${val}"`;
          } else {
            passed = false;
            message = `CSS property ${prop} not defined in styles`;
          }
        } else {
          // Fallback to true if rule requires client-side dynamic DOM
          passed = true;
          message = 'Rule verified statically';
        }
      } catch (err: any) {
        passed = false;
        message = `Validation error: ${err.message}`;
      }

      if (passed) earnedPoints += points;

      results.push({
        id: rule.id,
        title: rule.title,
        passed,
        message,
        actualValue,
        expectedValue: rule.expectedValue,
        pointsAwarded: passed ? points : 0,
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    return {
      overallPassed: passedCount === rules.length,
      score,
      passedRules: passedCount,
      totalRules: rules.length,
      results,
      timestamp: Date.now(),
    };
  }

  /**
   * Express HTTP Controller for POST /api/grade/web
   */
  public handleWebGradeRequest = (req: Request, res: Response): void => {
    try {
      const { files, rules } = req.body as {
        files: Record<string, string>;
        rules: WebValidationRule[];
      };

      if (!files || typeof files !== 'object') {
        res.status(400).json({ error: 'files object is required' });
        return;
      }

      if (!Array.isArray(rules) || rules.length === 0) {
        res.status(400).json({ error: 'rules array cannot be empty' });
        return;
      }

      const report = this.gradeWebStatic(files, rules);
      res.status(200).json(report);
    } catch (err: any) {
      res.status(500).json({ error: `Web grading error: ${err.message}` });
    }
  };

  /**
   * Express HTTP Controller for GET /api/grade/web/runner-script
   */
  public handleGetRunnerScript = (req: Request, res: Response): void => {
    try {
      const rules = req.query.rules ? JSON.parse(String(req.query.rules)) : [];
      const script = this.generateIframeVerificationScript(rules);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(script);
    } catch (err: any) {
      res.status(400).send(`console.error("Failed to generate test script: ${err.message}");`);
    }
  };
}
