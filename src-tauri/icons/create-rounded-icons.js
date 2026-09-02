import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createRoundedIcon() {
  const sourceImage = 'backup-original/icon-1024.png';
  const outputDir = '.';

  // Windows 桌面快捷方式和任务栏需要的完整尺寸集合
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512];

  console.log('开始处理圆角图标（完整版本）...');
  console.log('源图片:', sourceImage);

  try {
    const image = sharp(sourceImage);
    const metadata = await image.metadata();
    console.log('原始图片尺寸:', metadata.width, 'x', metadata.height);

    const iconBuffers = [];

    // 从大到小处理，确保大图标质量
    for (const size of sizes) {
      console.log(`\n处理 ${size}x${size} 图标...`);

      // 圆角半径（15%）
      const radius = Math.round(size * 0.15);

      // 创建圆角蒙版
      const roundedCorner = Buffer.from(
        `<svg width="${size}" height="${size}">
          <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/>
        </svg>`
      );

      // 高质量调整大小并应用圆角
      const roundedIcon = await sharp(sourceImage)
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true,
        })
        .composite([{
          input: roundedCorner,
          blend: 'dest-in'
        }])
        .png({
          compressionLevel: 9,
          quality: 100,
          adaptiveFiltering: true,
          effort: 10 // 最大压缩努力
        })
        .toBuffer();

      iconBuffers.push(roundedIcon);

      // 保存单独的 PNG 文件
      await fs.promises.writeFile(
        path.join(outputDir, `icon-${size}x${size}.png`),
        roundedIcon
      );
      console.log(`✓ 已生成 icon-${size}x${size}.png`);
    }

    // 生成 ICO 文件（从大到小排序）
    console.log('\n生成 ICO 文件...');
    const icoBuffer = await pngToIco(iconBuffers);
    await fs.promises.writeFile(path.join(outputDir, 'icon.ico'), icoBuffer);
    console.log('✓ 已生成 icon.ico (包含 ' + sizes.length + ' 个尺寸)');

    // 复制到配置文件需要的文件名
    console.log('\n复制到配置文件指定的文件名...');
    await fs.promises.copyFile('icon-32x32.png', '32x32.png');
    await fs.promises.copyFile('icon-128x128.png', '128x128.png');
    await fs.promises.copyFile('icon-256x256.png', '128x128@2x.png');
    console.log('✓ 已更新 32x32.png, 128x128.png, 128x128@2x.png');

    // 生成任务栏专用图标
    console.log('\n生成任务栏/托盘图标...');
    const taskbarSizes = [16, 20, 24, 32, 40, 48];
    for (const size of taskbarSizes) {
      const radius = Math.round(size * 0.15);
      const roundedCorner = Buffer.from(
        `<svg width="${size}" height="${size}">
          <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/>
        </svg>`
      );

      await sharp(sourceImage)
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true,
        })
        .composite([{
          input: roundedCorner,
          blend: 'dest-in'
        }])
        .png({
          compressionLevel: 9,
          quality: 100,
          adaptiveFiltering: true,
          effort: 10
        })
        .toFile(path.join(outputDir, `taskbar-${size}.png`));

      console.log(`✓ 已生成 taskbar-${size}.png`);
    }

    console.log('\n✅ 所有图标处理完成！');
    console.log('\n生成的文件:');
    console.log('- icon.ico (包含 10 个尺寸: 16-512px)');
    console.log('- icon-16x16.png 到 icon-512x512.png');
    console.log('- 32x32.png, 128x128.png, 128x128@2x.png');
    console.log('- taskbar-16.png 到 taskbar-48.png');
    console.log('\n重要提示:');
    console.log('1. 圆角半径为图标尺寸的 15%，保持高质量无损处理');
    console.log('2. 重新构建应用后，如果桌面快捷方式图标未更新，请清理 Windows 图标缓存：');
    console.log('   - 按 Win+R，输入: ie4uinit.exe -show');
    console.log('   - 或重启资源管理器进程');

  } catch (error) {
    console.error('处理图标时出错:', error);
    process.exit(1);
  }
}

createRoundedIcon();