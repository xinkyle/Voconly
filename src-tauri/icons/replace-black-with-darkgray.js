import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function replaceBlackWithDarkGray() {
  const sourceImage = path.join(__dirname, 'backup-original/icon-1024.png');
  const outputFile = path.join(__dirname, 'backup-original/icon-1024-darkgray.png');

  console.log('读取源图片:', sourceImage);

  try {
    // 读取图片
    const image = sharp(sourceImage);
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log('图片尺寸:', info.width, 'x', info.height);

    // 遍历每个像素，将黑色替换为深灰色
    const darkGrayValue = 40; // RGB(40, 40, 40) - 比黑色稍淡
    let replacedCount = 0;

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = info.channels === 4 ? data[i + 3] : 255;

      // 只处理黑色像素（RGB 都接近 0）
      if (a > 200 && r <= 10 && g <= 10 && b <= 10) {
        // 替换为深灰色
        data[i] = darkGrayValue;     // R
        data[i + 1] = darkGrayValue; // G
        data[i + 2] = darkGrayValue; // B
        replacedCount++;
      }
    }

    console.log('替换的像素数:', replacedCount);

    // 保存修改后的图片
    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels
      }
    })
    .png({
      compressionLevel: 9,
      quality: 100
    })
    .toFile(outputFile);

    console.log('✅ 已保存到:', outputFile);

  } catch (error) {
    console.error('处理图片时出错:', error);
    process.exit(1);
  }
}

replaceBlackWithDarkGray();