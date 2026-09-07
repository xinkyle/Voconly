const png2icons = require('png2icons');
const fs = require('fs');

const png = fs.readFileSync('icon-1024.png');
const icns = png2icons.createICNS(png, png2icons.BICUBIC, 0);
fs.writeFileSync('icon.icns', icns);
console.log('✅ icon.icns 已生成:', fs.statSync('icon.icns').size, '字节');