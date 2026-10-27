/**
 * 云函数 recognize —— 生物识别
 *
 * 用任意 OpenAI 兼容的视觉模型接口，在云函数环境变量里配三项：
 *   VISION_BASE_URL  例：https://api.deepseek.com/v1  或  你自己的代理地址
 *   VISION_API_KEY   对应 key
 *   VISION_MODEL     支持图片输入的模型名
 *
 * 返回：{ category: 'flower'|'bird'|'fish'|'insect'|'', species, confidence }
 * 识别不出就返回空 category，小程序端会自动退回「我记录过的」列表。
 */
const cloud = require('wx-server-sdk');
const https = require('https');
const { URL } = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BASE_URL = process.env.VISION_BASE_URL || '';
const API_KEY = process.env.VISION_API_KEY || '';
const MODEL = process.env.VISION_MODEL || '';

const PROMPT = `你是生物识别助手。看图片，判断画面主角属于哪一类，并尽量给出具体品种。

只能从这四个类别里选一个：
- flower：花、绿植、多肉、观叶植物等一切植物
- bird：鸟、鹦鹉、雀类
- fish：鱼、观赏鱼、水族、龟等水里的
- insect：昆虫、甲虫、蜘蛛、螳螂等节肢动物

严格只返回一行 JSON，不要解释、不要代码块：
{"category":"flower|bird|fish|insect","species":"具体品种中文名，不确定就空字符串","confidence":0.0到1.0之间的小数}

如果画面里没有明显生物主体，返回：
{"category":"","species":"","confidence":0}`;

function postJSON(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          headers
        ),
        timeout: 25000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error('返回不是 JSON'));
            }
          } else {
            reject(new Error(`模型接口 ${res.statusCode}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function extractJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
}

exports.main = async (event) => {
  if (!BASE_URL || !API_KEY || !MODEL) {
    return { category: '', species: '', confidence: 0, error: '未配置视觉模型环境变量' };
  }
  if (!event.fileID) {
    return { category: '', species: '', confidence: 0, error: '缺少图片' };
  }

  try {
    // 1. 从云存储把图拉下来
    const dl = await cloud.downloadFile({ fileID: event.fileID });
    const base64 = dl.fileContent.toString('base64');

    // 2. 交给视觉模型
    const res = await postJSON(
      `${BASE_URL.replace(/\/$/, '')}/chat/completions`,
      { Authorization: `Bearer ${API_KEY}` },
      {
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
            ],
          },
        ],
      }
    );

    const content =
      res && res.choices && res.choices[0] && res.choices[0].message
        ? res.choices[0].message.content
        : '';
    const parsed = extractJSON(content) || {};

    const allowed = ['flower', 'bird', 'fish', 'insect'];
    const category = allowed.indexOf(parsed.category) > -1 ? parsed.category : '';

    return {
      category,
      species: String(parsed.species || '').slice(0, 40),
      confidence: Number(parsed.confidence) || 0,
      source: 'vision',
    };
  } catch (e) {
    return { category: '', species: '', confidence: 0, error: e.message || '识别失败' };
  }
};
