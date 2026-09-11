import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon } from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapPin } from 'lucide-react';

// Mock data for issues
const ISSUE_LOCATIONS = [
  { id: 1, name: 'Store #102 - KL Sentral', lat: 3.133, lng: 101.686, issues: 3, status: 'critical' },
  { id: 2, name: 'Store #205 - Penang', lat: 5.414, lng: 100.328, issues: 1, status: 'warning' },
  { id: 3, name: 'Store #301 - JB City', lat: 1.492, lng: 103.741, issues: 5, status: 'critical' },
  { id: 4, name: 'Store #502 - Ipoh', lat: 4.597, lng: 101.090, issues: 2, status: 'warning' },
  { id: 5, name: 'Store #601 - Kota Kinabalu', lat: 5.9804, lng: 116.0735, issues: 4, status: 'critical' },
  { id: 6, name: 'Store #703 - Kuching', lat: 1.5533, lng: 110.3592, issues: 1, status: 'warning' },
];

const createCustomIcon = (status: string) => {
  const color = status === 'critical' ? '#EF4444' : '#F59E0B';
  
  const iconMarkup = renderToStaticMarkup(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="32" 
        height="32" 
        viewBox="0 0 24 24" 
        fill={color} 
        stroke="white" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07))' }}
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" fill="white" />
      </svg>
    </div>
  );

  return divIcon({
    html: iconMarkup,
    className: 'custom-marker-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

export function ComplianceMap() {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-sm border border-gray-100 z-0 relative">
      <MapContainer 
        center={[4.2105, 101.9758]} 
        zoom={6} 
        scrollWheelZoom={false} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {ISSUE_LOCATIONS.map((loc) => (
          <Marker 
            key={loc.id} 
            position={[loc.lat, loc.lng]} 
            icon={createCustomIcon(loc.status)}
          >
            <Popup>
              <div className="p-1 min-w-[150px]">
                <h3 className="font-bold text-sm text-gray-800">{loc.name}</h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">Issues Found:</span>
                  <span className={`font-bold text-sm ${loc.status === 'critical' ? 'text-red-600' : 'text-amber-500'}`}>
                    {loc.issues}
                  </span>
                </div>
                <div className={`mt-2 text-[10px] font-bold px-2 py-1 rounded-full inline-block uppercase tracking-wide ${
                  loc.status === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {loc.status}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
