const { scanFiles }=require('./media'); const { shuffle }=require('./utils'); const IMAGE_EXTENSIONS=new Set(['.jpg','.jpeg','.png','.webp']);
async function pickThumbnail(directory){if(!directory)return '';const files=await scanFiles(directory,IMAGE_EXTENSIONS).catch(()=>[]);return files.length?shuffle(files)[0]:'';} module.exports={pickThumbnail};
