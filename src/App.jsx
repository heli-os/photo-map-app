import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import exifr from 'exifr';
import Supercluster from 'supercluster';
import 'leaflet/dist/leaflet.css';

// Add global CSS to hide scrollbars
const globalCSS = `
  /* Hide scrollbar for Chrome, Safari and Opera */
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  .no-scrollbar {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
`;

// Inject global CSS
const style = document.createElement('style');
style.textContent = globalCSS;
document.head.appendChild(style);

// Fix Leaflet marker icon issues
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Modal Gallery Component
const ImageGallery = ({ images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  
  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };
  
  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        nextImage();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Calculate remaining images on both sides
  const remainingLeft = currentIndex;
  const remainingRight = images.length - currentIndex - 1;

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-gray-800">
        <div className="text-white font-medium">
          {currentIndex + 1} / {images.length}
        </div>
        <button 
          onClick={onClose}
          className="text-white hover:text-gray-300 px-2 py-1 rounded bg-gray-700"
        >
          닫기
        </button>
      </div>
      
      {/* Main image container - fixed height */}
      <div className="flex-1 flex items-center justify-center relative bg-black overflow-hidden">
        <img 
          src={images[currentIndex].url} 
          alt={`Photo ${currentIndex + 1}`}
          className="max-h-[calc(100vh-150px)] max-w-[95vw] object-contain"
        />
        
        {/* Navigation buttons */}
        {images.length > 1 && (
          <>
            <button 
              onClick={prevImage}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-opacity-70"
              aria-label="Previous image"
            >
              ◀
            </button>
            <button 
              onClick={nextImage}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-opacity-70"
              aria-label="Next image"
            >
              ▶
            </button>
          </>
        )}
      </div>
      
      {/* Thumbnails - fixed height */}
      <div className="bg-gray-800 h-20 p-3 flex flex-col justify-center overflow-hidden">
        {/* Remaining images indicator */}
        <div className="flex justify-between px-4 mb-1 text-xs text-gray-400">
          <div>{remainingLeft > 0 ? `← ${remainingLeft}장 더` : ''}</div>
          <div>{remainingRight > 0 ? `${remainingRight}장 더 →` : ''}</div>
        </div>
        
        <div className="flex space-x-2 overflow-x-auto max-w-full px-4 pb-4 no-scrollbar">
          {images.map((img, idx) => (
            <div 
              key={idx} 
              onClick={() => setCurrentIndex(idx)}
              className={`h-14 w-14 flex-shrink-0 rounded cursor-pointer transition-all duration-200 ${
                idx === currentIndex ? 'ring-2 ring-blue-500 scale-110' : 'opacity-70'
              }`}
            >
              <img 
                src={img.url} 
                alt={`Thumbnail ${idx + 1}`} 
                className="h-full w-full object-cover rounded"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Custom photo marker icon
const createPhotoIcon = (photoUrl) => {
  return L.divIcon({
    html: `<div class="w-10 h-10 rounded overflow-hidden border-2 border-white shadow"><img src="${photoUrl}" alt="Photo" class="w-full h-full object-cover"/></div>`,
    className: '',
    iconSize: [40, 40]
  });
};

// Custom cluster icon with badge
const createClusterIcon = (count) => {
  return L.divIcon({
    html: `<div class="flex items-center justify-center w-10 h-10 bg-blue-500 text-white rounded-full font-bold border-2 border-white shadow">${count}</div>`,
    className: '',
    iconSize: [40, 40]
  });
};

// Component to handle map zoom events and update clusters
function ClusterManager({ photos, onPhotoClick, onClusterClick }) {
  const map = useMap();
  const [markers, setMarkers] = useState([]);
  const superclusterRef = useRef(null);
  
  useEffect(() => {
    if (photos.length > 0) {
      // Initialize supercluster
      superclusterRef.current = new Supercluster({
        radius: 40,
        maxZoom: 16
      });
      
      // Add points to the cluster
      const points = photos.map(photo => ({
        type: 'Feature',
        properties: { 
          id: photo.id,
          photoUrl: photo.url,
          photo: photo // Store the entire photo object
        },
        geometry: {
          type: 'Point',
          coordinates: [photo.lng, photo.lat]
        }
      }));
      
      superclusterRef.current.load(points);
      updateClusters();
    }
  }, [photos]);
  
  useEffect(() => {
    map.on('zoomend', updateClusters);
    map.on('moveend', updateClusters);
    
    return () => {
      map.off('zoomend', updateClusters);
      map.off('moveend', updateClusters);
    };
  }, [map]);
  
  const updateClusters = () => {
    if (!superclusterRef.current) return;
    
    const bounds = map.getBounds();
    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ];
    
    const zoom = map.getZoom();
    const clusters = superclusterRef.current.getClusters(bbox, zoom);
    
    const newMarkers = clusters.map(cluster => {
      const [lng, lat] = cluster.geometry.coordinates;
      const { cluster: isCluster, point_count: pointCount, cluster_id } = cluster.properties;
      
      if (isCluster) {
        // Get all photos in this cluster
        const clusterPhotos = [];
        const leaves = superclusterRef.current.getLeaves(cluster_id, Infinity);
        leaves.forEach(leaf => {
          if (leaf.properties.photo) {
            clusterPhotos.push(leaf.properties.photo);
          }
        });
        
        return {
          id: `cluster-${cluster.id}`,
          lat,
          lng,
          isCluster: true,
          count: pointCount,
          photos: clusterPhotos
        };
      } else {
        const { id, photoUrl, photo } = cluster.properties;
        return {
          id,
          lat,
          lng,
          isCluster: false,
          photoUrl,
          photo
        };
      }
    });
    
    setMarkers(newMarkers);
  };
  
  return (
    <>
      {markers.map(marker => (
        marker.isCluster ? (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={createClusterIcon(marker.count)}
            eventHandlers={{
              click: () => {
                if (onClusterClick && marker.photos && marker.photos.length > 0) {
                  onClusterClick(marker.photos);
                } else {
                  map.flyTo([marker.lat, marker.lng], map.getZoom() + 2);
                }
              }
            }}
          />
        ) : (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={createPhotoIcon(marker.photoUrl)}
            eventHandlers={{
              click: () => {
                if (onPhotoClick && marker.photo) {
                  onPhotoClick([marker.photo], 0);
                }
              }
            }}
          />
        )
      ))}
    </>
  );
}

// Main App component
function App() {
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [gallery, setGallery] = useState(null);
  
  const [loadingProgress, setLoadingProgress] = useState({ processed: 0, total: 0 });
  
  const handleFileUpload = async (event) => {
    setIsLoading(true);
    const files = event.target.files;
    
    // 파일 처리 큐를 사용하여 대량의 파일을 효율적으로 처리
    const queue = Array.from(files).filter(file => file.type.startsWith('image/'));
    const newPhotos = [];
    let processedCount = 0;
    const totalFiles = queue.length;
    
    setLoadingProgress({ processed: 0, total: totalFiles });
    
    // 파일 처리를 작은 배치로 나누어 UI 차단 방지
    const processBatch = async (startIdx, batchSize) => {
      const endIdx = Math.min(startIdx + batchSize, totalFiles);
      const promises = [];
      
      for (let i = startIdx; i < endIdx; i++) {
        const file = queue[i];
        promises.push(processPhoto(file));
      }
      
      const results = await Promise.allSettled(promises);
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          newPhotos.push(result.value);
        }
      });
      
      processedCount += promises.length;
      setLoadingProgress({ processed: processedCount, total: totalFiles });
      
      // 진행 상황 업데이트
      if (processedCount < totalFiles) {
        // 다음 배치 처리 전에 UI 업데이트 시간 부여
        setTimeout(() => {
          processBatch(endIdx, batchSize);
        }, 0);
      } else {
        // 모든 처리 완료
        setPhotos(prev => [...prev, ...newPhotos]);
        setIsLoading(false);
      }
    };
    
    if (totalFiles > 0) {
      // 한 번에 10개씩 파일 처리
      processBatch(0, 10);
    } else {
      setIsLoading(false);
    }
  };
  
  const processPhoto = (file) => {
    return new Promise((resolve, reject) => {
      // Create URL for thumbnail preview
      const photoUrl = URL.createObjectURL(file);
      
      // Extract EXIF data using exifr
      exifr.gps(file).then(gpsData => {
        if (!gpsData || !gpsData.latitude || !gpsData.longitude) {
          console.warn('No GPS data found for photo:', file.name);
          resolve(null);
          return;
        }
        
        resolve({
          id: `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: photoUrl,
          name: file.name,
          lat: gpsData.latitude,
          lng: gpsData.longitude
        });
      }).catch(error => {
        console.error('Error extracting GPS data:', error);
        reject(error);
      });
    });
  };
  
  const handlePhotoClick = (photos, initialIndex) => {
    setGallery({
      images: photos,
      initialIndex
    });
  };
  
  const handleClusterClick = (photos) => {
    setGallery({
      images: photos,
      initialIndex: 0
    });
  };
  
  const closeGallery = () => {
    setGallery(null);
  };
  
  return (
    <div className="absolute inset-0 flex flex-col h-screen w-screen overflow-hidden">
      <header className="flex justify-between items-center p-0 px-5 bg-slate-800 text-white h-16 w-full z-10">
        <h1 className="text-2xl font-semibold m-0">Photo Map</h1>
        <div className="flex gap-3">
          <div className="file-upload">
            <label htmlFor="directory-upload" className="px-4 py-2 bg-green-600 text-white rounded cursor-pointer hover:bg-green-700 transition-colors">
              폴더 업로드
            </label>
            <input
              type="file"
              id="directory-upload"
              webkitdirectory="true"
              directory="true"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <div className="file-upload">
            <label htmlFor="photo-upload" className="px-4 py-2 bg-blue-500 text-white rounded cursor-pointer hover:bg-blue-600 transition-colors">
              사진 업로드
            </label>
            <input
              type="file"
              id="photo-upload"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </header>
      
      <main className="relative w-full h-[calc(100vh-4rem)] flex-1">
        {isLoading && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-black/70 text-white px-5 py-2.5 rounded max-w-md w-full">
            <div className="flex flex-col gap-2">
              <div className="text-center">
                사진 처리 중... ({loadingProgress.processed}/{loadingProgress.total})
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${loadingProgress.total ? (loadingProgress.processed / loadingProgress.total * 100) : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}
        
        <MapContainer
          center={[36.5, 127.8]} // Center of South Korea
          zoom={7} // Show all of South Korea
          className="h-full w-full"
          zoomControl={false} // Move zoom control to right side
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <div className="leaflet-control-container">
            <div className="leaflet-top leaflet-right">
              <div className="leaflet-control-zoom leaflet-bar leaflet-control">
                <a className="leaflet-control-zoom-in" href="#" title="Zoom in" role="button" aria-label="Zoom in">+</a>
                <a className="leaflet-control-zoom-out" href="#" title="Zoom out" role="button" aria-label="Zoom out">−</a>
              </div>
            </div>
          </div>
          <ClusterManager 
            photos={photos} 
            onPhotoClick={handlePhotoClick}
            onClusterClick={handleClusterClick}
          />
        </MapContainer>
      </main>
      
      {gallery && (
        <ImageGallery 
          images={gallery.images} 
          initialIndex={gallery.initialIndex}
          onClose={closeGallery}
        />
      )}
    </div>
  );
}

export default App;
