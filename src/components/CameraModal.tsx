import React, { useRef, useState, useEffect } from 'react';
import { X, Camera } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photoUrl: string) => void;
}

export function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    if (isOpen) {
      setError('');
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          currentStream = s;
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch(err => {
          console.error("Camera error:", err);
          setError('Could not access the camera. Please ensure you have granted camera permissions.');
        });
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photoUrl = canvas.toDataURL('image/jpeg');
      onCapture(photoUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl">
        <div className="p-4 flex justify-between items-center border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-900">Take Photo</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <div className="bg-black relative aspect-video flex items-center justify-center">
          {error ? (
            <div className="text-white text-center p-6">
              <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{error}</p>
            </div>
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-contain"
            />
          )}
        </div>
        
        <div className="p-6 flex justify-center bg-gray-50 border-t border-gray-100">
          <button 
            onClick={takePhoto} 
            disabled={!!error}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-full flex items-center gap-2 font-bold transition-colors shadow-md hover:shadow-lg"
          >
            <Camera className="w-5 h-5" /> 
            Capture Photo
          </button>
        </div>
      </div>
    </div>
  );
}
