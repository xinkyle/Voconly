import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function replaceGrayWithBlack() {
  const sourceImage = path.join(__dirname, 'backup-original/icon-1024.png');
  const outputFile = path.join(__dirname, 'backup-original/icon-1024-black.png');

  console.log('读取源图片:', sourceImage);

  try {
    // 读取图片
    const image = sharp(sourceImage);
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log('图片尺寸:', info.width, 'x', info.height);
    console.log('通道数:', info.channels);

    // 遍历每个像素，将灰色替换为黑色
    // 灰色判断：R、G、B 值相近（差异小于阈值）且值在灰色范围内
    const grayThreshold = 30; // RGB 差异阈值
    const minGray = 50;  // 灰色最小值
    const maxGray = 200; // 灰色最大值

    let replacedCount = 0;

    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = info.channels === 4 ? data[i + 3] : 255;

      // 只处理不透明的像素
      if (a > 200) {
        // 检查是否是灰色（RGB 值相近）
        const isGray = Math.abs(r - g) < grayThreshold &&
                       Math.abs(g - b) < grayThreshold &&
                       Math.abs(r - b) < grayThreshold;

        // 检查是否在灰色范围内
        const avgValue = (r + g + b) / 3;
        const inGrayRange = avgValue >= minGray && avgValue <= maxGray;

        if (isGray && inGrayRange) {
          // 替换为黑色
          data[i] = 0;     // R
          data[i + 1] = 0; // G
          data[i + 2] = 0; // B
          // 保持 alpha 不变
          replacedCount++;
        }
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

    // 同时覆盖原文件
    await fs.promises.copyFile(outputFile, sourceImage);
    console.log('✅ 已更新原文件:', sourceImage);

  } catch (error) {
    console.error('处理图片时出错:', error);
    process.exit(1);
  }
}

replaceGrayWithBlack();