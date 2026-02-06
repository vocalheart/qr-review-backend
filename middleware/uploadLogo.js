import multer from 'multer'

const storage = multer.memoryStorage();

const uploadLogo = multer ({
    storage,
    limits:{fileSize: 2 * 1024 *1024},
    fileFilter:(req, file, cb)=>{
        if(!file.mimetype.startsWith("image/")){
            cb(new Error("Only images files allowed"))
        }
        cb(null , true)
    }
})

export default uploadLogo;
