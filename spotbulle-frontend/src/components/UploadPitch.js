import { useState } from "react";    
import axios from "axios";    
    
const UploadPitch = () => {    
  const [file, setFile] = useState(null);    
  const [progress, setProgress] = useState(0);    
  const [message, setMessage] = useState("");    
    
  const handleUpload = async () => {    
    const formData = new FormData();    
    formData.append("file", file);    
    
    const response = await axios.post("http://localhost:8000/upload_pitch/", formData, {    
      onUploadProgress: (progressEvent) => {    
        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);    
        setProgress(percent);    
      },    
    });    
    
    setMessage(response.data.message);    
  };    
    
  return (    
    <div className="container mx-auto p-4">    
      <input type="file" onChange={(e) => setFile(e.target.files[0])} className="border p-2" />    
      <button onClick={handleUpload} className="bg-blue-500 text-white p-2 rounded">Uploader</button>    
      {progress > 0 && <div className="mt-2">Progression : {progress}%</div>}    
      {message && <p className="mt-2 text-green-500">{message}</p>}    
    </div>    
  );    
};    
    
export default UploadPitch;
