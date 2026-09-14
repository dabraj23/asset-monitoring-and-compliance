import { useState } from 'react';
import { Camera, MessageSquare, CheckCircle2, Plus, Sparkles, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { CameraModal } from '../components/CameraModal';

const wasteIdSections = [
  {
    title: 'Intake & Verification',
    items: [
      'Confirm customer declaration form received',
      'Verify waste description matches physical material',
      'Check source of waste (factory / process line)',
      'Capture photo of incoming waste',
      'Record date and time of receipt'
    ]
  },
  {
    title: 'Classification',
    items: [
      'Assign correct SW code',
      'Cross-check SW code against DOE list',
      'Confirm hazardous vs non-hazardous classification',
      'Validate classification with supervisor (if required)',
      'Ensure no “unknown” or blank classification'
    ]
  },
  {
    title: 'Physical Inspection',
    items: [
      'Check for mixed waste types',
      'Identify presence of hazardous elements',
      'Verify no prohibited materials included',
      'Confirm waste condition (solid, liquid, sludge, etc.)'
    ]
  },
  {
    title: 'Segregation',
    items: [
      'Place waste in correct zone',
      'Confirm zone matches SW code category',
      'Ensure no mixing with other waste types',
      'Check container type is appropriate',
      'Verify area labeling is correct'
    ]
  },
  {
    title: 'Labeling & Tagging',
    items: [
      'Attach label with SW code',
      'Include waste description',
      'Include source',
      'Include date received',
      'Assign unique batch ID',
      'Ensure label is readable and secure'
    ]
  },
  {
    title: 'System Entry',
    items: [
      'Enter classification into system',
      'Ensure mandatory fields completed',
      'Upload photo evidence',
      'Link batch ID to system record',
      'Confirm data saved correctly'
    ]
  },
  {
    title: 'Compliance Checks',
    items: [
      'Verify classification aligns with DOE requirements',
      'Confirm no manual overrides without approval',
      'Check for duplicate or conflicting entries'
    ]
  },
  {
    title: 'Documentation',
    items: [
      'File intake record',
      'Store classification record',
      'Ensure audit trail is created',
      'Confirm document is retrievable'
    ]
  },
  {
    title: 'Exception Handling',
    items: [
      'Flag any uncertainty in classification',
      'Escalate to supervisor immediately',
      'Record issue in exception log'
    ]
  },
  {
    title: 'Final Confirmation',
    items: [
      'Supervisor sign-off completed',
      'Batch cleared for next stage'
    ]
  }
];

const chainOfCustodySections = [
  {
    title: '1. Batch Creation',
    items: [
      'Assign unique batch ID',
      'Ensure ID is not reused',
      'Link batch ID to: Waste type, Source, Customer',
      'Create record in system'
    ]
  },
  {
    title: '2. Collection (At Customer Site)',
    items: [
      'Confirm correct batch is collected',
      'Record pickup date',
      'Record pickup time',
      'Record driver name',
      'Record vehicle number',
      'Verify waste matches declared type',
      'Capture photo of waste before loading',
      'Ensure proper packaging / containment',
      'Obtain customer signature / confirmation',
      'Tag batch with ID (label / QR / barcode)'
    ]
  },
  {
    title: '3. Dispatch / Departure',
    items: [
      'Record departure time',
      'Confirm batch loaded matches system record',
      'Verify number of containers / units',
      'Ensure labels are intact and visible',
      'Confirm transport documents are prepared',
      'Driver acknowledges responsibility'
    ]
  },
  {
    title: '4. Transport Monitoring',
    items: [
      'Track route (GPS if available)',
      'Monitor transit duration',
      'Log any route deviation',
      'Log any delay',
      'Record any incident: Spill, Damage, Loss',
      'Escalate issues immediately'
    ]
  },
  {
    title: '5. Receiving (At Plant)',
    items: [
      'Record arrival date',
      'Record arrival time',
      'Verify batch ID matches system',
      'Confirm vehicle details match dispatch',
      'Capture photo upon arrival',
      'Inspect condition of waste: Intact, Leakage, Damage',
      'Record receiving staff name'
    ]
  },
  {
    title: '6. Weighbridge Control',
    items: [
      'Record gross weight (vehicle + waste)',
      'Record tare weight',
      'Calculate net weight',
      'Link weight to batch ID',
      'Compare against expected quantity',
      'Flag any abnormal variance',
      'Store weighbridge ticket'
    ]
  },
  {
    title: '7. Intake Verification',
    items: [
      'Confirm waste type matches classification',
      'Check for contamination or mixing',
      'Verify container count matches dispatch',
      'Approve or reject intake',
      'Log discrepancies if any'
    ]
  },
  {
    title: '8. Internal Movement (Within Facility)',
    items: [
      'Record movement from receiving → storage / processing',
      'Track location of batch within facility',
      'Ensure no mixing with other batches',
      'Maintain batch ID visibility at all times'
    ]
  },
  {
    title: '9. Processing Stage',
    items: [
      'Record processing start time',
      'Record processing end time',
      'Record processing method',
      'Capture output: Recovered metal quantity, Residual waste quantity',
      'Link outputs to original batch ID',
      'Record operator name'
    ]
  },
  {
    title: '10. Output & Segregation',
    items: [
      'Assign IDs to output materials (if split)',
      'Maintain traceability to original batch',
      'Store outputs in correct zones',
      'Label all outputs properly'
    ]
  },
  {
    title: '11. Documentation Generation',
    items: [
      'Generate consignment note',
      'Generate transport manifest',
      'Record processing report',
      'Generate recovery / disposal certificate',
      'Store all documents in system',
      'Ensure documents are complete and signed'
    ]
  },
  {
    title: '12. eSWIS Reporting',
    items: [
      'Enter batch details into eSWIS',
      'Record movement (generation, transport, receiving)',
      'Verify data matches internal system',
      'Submit within required timeline',
      'Confirm submission successful'
    ]
  },
  {
    title: '13. Handover (Internal / External)',
    items: [
      'Record sender name',
      'Record receiver name',
      'Record handover time',
      'Obtain signature / digital confirmation',
      'Ensure responsibility transfer is clear'
    ]
  },
  {
    title: '14. External Disposal / Vendor Transfer',
    items: [
      'Verify vendor license validity',
      'Record vendor details',
      'Record transfer date and time',
      'Obtain disposal / recovery proof',
      'Link vendor documents to batch ID'
    ]
  },
  {
    title: '15. Exception Handling',
    items: [
      'Log missing batch issues',
      'Log weight discrepancies',
      'Log mismatched records',
      'Log delayed movements',
      'Record incident details',
      'Escalate to supervisor'
    ]
  }
];

export function Compliance() {
  const [locations, setLocations] = useState([
    { id: 'hq', name: 'Headquarters' },
    { id: 'branch-a', name: 'Branch A' },
    { id: 'warehouse', name: 'Main Warehouse' }
  ]);
  const [activeLocation, setActiveLocation] = useState('hq');
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');

  const [categories, setCategories] = useState([
    { id: 'waste-id', label: 'Waste ID & Classification' },
    { id: 'chain-of-custody', label: 'Chain of Custody Tracking' },
    { id: 'fire', label: 'Fire Extinguisher' },
    { id: 'hostel', label: 'Hostel Audit' },
    { id: 'cleanliness', label: 'Cleanliness' }
  ]);
  const [activeTab, setActiveTab] = useState('waste-id');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // Key is `${locationId}-${categoryId}`
  const [customItems, setCustomItems] = useState<Record<string, {id: string, text: string}[]>>({});
  const [newItemText, setNewItemText] = useState('');

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [currentCaptureId, setCurrentCaptureId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [openRemarks, setOpenRemarks] = useState<Record<string, boolean>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const updateTimestamp = (id: string) => {
    setTimestamps(prev => ({
      ...prev,
      [id]: new Date().toLocaleString()
    }));
  };

  const handleOpenCamera = (id: string) => {
    setCurrentCaptureId(id);
    setIsCameraOpen(true);
  };

  const handleCapture = (photoUrl: string) => {
    if (currentCaptureId) {
      setPhotos(prev => ({
        ...prev,
        [currentCaptureId]: [...(prev[currentCaptureId] || []), photoUrl]
      }));
      updateTimestamp(currentCaptureId);
      toast.success('Photo captured and attached to checklist item');
    }
  };

  const handleAddLocation = () => {
    if (newLocationName.trim()) {
      const newId = newLocationName.toLowerCase().replace(/\s+/g, '-');
      setLocations([...locations, { id: newId, name: newLocationName }]);
      setActiveLocation(newId);
      setNewLocationName('');
      setIsAddingLocation(false);
      toast.success('New location added');
    }
  };

  const handleRemoveLocation = (idToRemove: string) => {
    if (locations.length <= 1) {
      toast.error('You must have at least one location');
      return;
    }
    setLocations(locations.filter(l => l.id !== idToRemove));
    if (activeLocation === idToRemove) {
      setActiveLocation(locations.find(l => l.id !== idToRemove)?.id || locations[0].id);
    }
    toast.success('Location removed');
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      const newId = newCategoryName.toLowerCase().replace(/\s+/g, '-');
      setCategories([...categories, { id: newId, label: newCategoryName }]);
      setActiveTab(newId);
      setNewCategoryName('');
      setIsAddingCategory(false);
      toast.success('New category added');
    }
  };

  const handleRemoveCategory = (idToRemove: string) => {
    if (categories.length <= 1) {
      toast.error('You must have at least one category');
      return;
    }
    setCategories(categories.filter(c => c.id !== idToRemove));
    if (activeTab === idToRemove) {
      setActiveTab(categories.find(c => c.id !== idToRemove)?.id || categories[0].id);
    }
    toast.success('Category removed');
  };

  const handleAddCustomItem = (categoryId: string) => {
    if (!newItemText.trim()) return;
    
    const newItem = {
      id: `custom-${crypto.randomUUID()}`,
      text: newItemText
    };

    const key = `${activeLocation}-${categoryId}`;
    setCustomItems(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), newItem]
    }));
    setNewItemText('');
    toast.success('Item added to checklist');
  };

  const handleGenerateChecklist = async (categoryId: string, categoryName: string) => {
    setIsGenerating(true);
    const toastId = toast.loading('AI is analyzing context and generating checklist...');
    
    try {
      const response = await fetch('/api/generate-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName })
      });

      if (!response.ok) throw new Error('Failed to generate checklist');
      
      const data = await response.json();
      const text = data.text;
      
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        if (Array.isArray(items)) {
          const newItems = items.map((text: string) => ({ id: `custom-${crypto.randomUUID()}`, text }));
          const key = `${activeLocation}-${categoryId}`;
          setCustomItems(prev => ({
            ...prev,
            [key]: [...(prev[key] || []), ...newItems]
          }));
          toast.success('Checklist generated successfully', { id: toastId });
        } else {
          throw new Error('Invalid format');
        }
      } else {
        throw new Error('Could not parse JSON');
      }
    } catch (error) {
      console.error('Error generating checklist:', error);
      toast.error('Failed to generate checklist. Please try again.', { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  const renderPhotos = (id: string) => {
    const itemPhotos = photos[id] || [];
    if (itemPhotos.length === 0) return null;
    return (
      <div className="flex gap-2 mt-2">
        {itemPhotos.map((url, idx) => (
          <div key={idx} className="relative w-12 h-12 rounded-md overflow-hidden border border-gray-200 shadow-sm">
            <img src={url} alt={`Captured ${idx}`} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  };

  const renderTimestamp = (id: string) => {
    if (!timestamps[id]) return null;
    return (
      <div className="text-xs text-gray-400 mt-1 font-medium">
        Last updated: {timestamps[id]}
      </div>
    );
  };

  const toggleRemark = (id: string) => {
    setOpenRemarks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderRemark = (id: string) => {
    const isOpen = openRemarks[id];
    const hasRemark = !!remarks[id];

    if (!isOpen && !hasRemark) return null;

    return (
      <div className="mt-3">
        {isOpen ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              rows={2}
              placeholder="Type your notes here..."
              value={remarks[id] || ''}
              onChange={(e) => {
                setRemarks(prev => ({ ...prev, [id]: e.target.value }));
                updateTimestamp(id);
              }}
            />
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={() => toggleRemark(id)}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Note
              </button>
            </div>
          </div>
        ) : (
          <div 
            className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-lg border border-yellow-100 cursor-pointer hover:bg-yellow-100 transition-colors"
            onClick={() => toggleRemark(id)}
          >
            <span className="font-semibold text-yellow-800 mr-2">Note:</span>
            {remarks[id]}
          </div>
        )}
      </div>
    );
  };

  const renderChecklistTable = (items: {id: string, text: string}[]) => {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-y border-gray-200">
              <th className="py-3 px-4 font-bold text-gray-700 w-1/2">Particulars</th>
              <th className="py-3 px-4 font-bold text-gray-700 text-center">Yes</th>
              <th className="py-3 px-4 font-bold text-gray-700 text-center">No</th>
              <th className="py-3 px-4 font-bold text-gray-700">Current Condition</th>
              <th className="py-3 px-4 font-bold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-500 bg-gray-50/50">
                  No items yet. Add your first checklist item above.
                </td>
              </tr>
            ) : (
              items.map((item, i) => (
                <tr key={item.id} className="hover:bg-gray-50/50">
                  <td className="py-4 px-4 text-gray-800 align-top">
                    <div className="font-medium">
                      {i + 1}. {item.text}
                    </div>
                    {renderTimestamp(item.id)}
                    {renderPhotos(item.id)}
                    {renderRemark(item.id)}
                  </td>
                  <td className="py-4 px-4 text-center align-top">
                    <input 
                      type="radio" 
                      name={`status-${item.id}`} 
                      onChange={() => updateTimestamp(item.id)} 
                      className="w-4 h-4 text-blue-600 mt-1" 
                    />
                  </td>
                  <td className="py-4 px-4 text-center align-top">
                    <input 
                      type="radio" 
                      name={`status-${item.id}`} 
                      onChange={() => updateTimestamp(item.id)} 
                      className="w-4 h-4 text-blue-600 mt-1" 
                    />
                  </td>
                  <td className="py-4 px-4 align-top">
                    <select 
                      value={conditions[item.id] || ''}
                      onChange={(e) => {
                        setConditions(prev => ({ ...prev, [item.id]: e.target.value }));
                        updateTimestamp(item.id);
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Select...</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="bad">Bad</option>
                    </select>
                  </td>
                  <td className="py-4 px-4 align-top">
                    <div className="flex gap-2">
                      <button 
                        type="button" 
                        onClick={() => handleOpenCamera(item.id)} 
                        className="p-1.5 text-gray-500 hover:text-blue-600 bg-white border border-gray-200 rounded shadow-sm transition-colors"
                        title="Take Photo"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => toggleRemark(item.id)} 
                        className="p-1.5 text-gray-500 hover:text-blue-600 bg-white border border-gray-200 rounded shadow-sm transition-colors"
                        title="Add Note"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a8a]">Site checklist prototype</h1>
          <p className="text-gray-500 mt-1">Preview checklist capture while the entity-wide compliance register is being built.</p>
        </div>
      </div>
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This legacy checklist is not saved to the shared server. Entries, added locations and captured photos are lost on refresh. Do not use it as a compliance record or report.</div>

      {/* Location Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-center gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 text-gray-700 font-medium px-2">
          <MapPin className="w-5 h-5 text-[#1e3a8a]" />
          Location:
        </div>
        {locations.map(loc => (
          <div key={loc.id} className="flex items-center">
            <button
              onClick={() => setActiveLocation(loc.id)}
              className={`px-4 py-2 rounded-l-lg text-sm font-medium transition-colors border ${
                activeLocation === loc.id 
                  ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {loc.name}
            </button>
            <button
              onClick={() => handleRemoveLocation(loc.id)}
              className={`px-2 py-2 rounded-r-lg border-y border-r transition-colors ${
                activeLocation === loc.id
                  ? 'bg-[#1e3a8a] text-white border-[#1e3a8a] hover:bg-blue-800'
                  : 'bg-white text-gray-400 border-gray-300 hover:bg-red-50 hover:text-red-600'
              }`}
              title="Remove Location"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {isAddingLocation ? (
          <div className="flex items-center gap-2 ml-2">
            <input 
              type="text" 
              value={newLocationName}
              onChange={e => setNewLocationName(e.target.value)}
              placeholder="Location Name"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddLocation()}
            />
            <button onClick={handleAddLocation} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Add</button>
            <button onClick={() => setIsAddingLocation(false)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
          </div>
        ) : (
          <button 
            onClick={() => setIsAddingLocation(true)}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg flex items-center gap-1 border border-transparent transition-colors ml-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add Location
          </button>
        )}
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/50 overflow-x-auto">
          {categories.map(tab => (
            <div key={tab.id} className="flex items-center border-b-2 transition-colors group" style={{ borderColor: activeTab === tab.id ? '#1e3a8a' : 'transparent', backgroundColor: activeTab === tab.id ? 'white' : 'transparent' }}>
              <button 
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-4 text-sm font-medium whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'text-[#1e3a8a]' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
              <button
                onClick={() => handleRemoveCategory(tab.id)}
                className={`pr-4 py-4 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ${activeTab === tab.id ? 'opacity-100' : ''}`}
                title="Remove Category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {isAddingCategory ? (
            <div className="flex items-center px-4 py-2 gap-2 border-b-2 border-transparent">
              <input 
                type="text" 
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Category Name"
                className="border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              />
              <button onClick={handleAddCategory} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Add</button>
              <button onClick={() => setIsAddingCategory(false)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
            </div>
          ) : (
            <button 
              onClick={() => setIsAddingCategory(true)}
              className="px-4 py-4 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center gap-1 border-b-2 border-transparent whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Add Category
            </button>
          )}
        </div>

        {/* Form Content */}
        <div className="p-8">
          {activeTab === 'waste-id' && (
            <div className="space-y-8 max-w-5xl">
              <div className="bg-blue-100 text-blue-800 font-bold py-2 px-4 rounded-lg uppercase tracking-wide text-sm border border-blue-200 inline-block">
                A. Waste Identification & Classification
              </div>
              <p className="text-gray-500 italic text-sm">(Tick / verify for every incoming batch at {locations.find(l => l.id === activeLocation)?.name})</p>

              <div className="space-y-8">
                {wasteIdSections.map((section, sIdx) => (
                  <div key={sIdx} className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">{section.title}</h3>
                    {renderChecklistTable(section.items.map((text, i) => ({ id: `waste-id-${activeLocation}-${sIdx}-${i}`, text })))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'chain-of-custody' && (
            <div className="space-y-8 max-w-5xl">
              <div className="bg-green-100 text-green-800 font-bold py-2 px-4 rounded-lg uppercase tracking-wide text-sm border border-green-200 inline-block">
                B. Chain of Custody Tracking
              </div>
              <p className="text-gray-500 italic text-sm">(To be completed for every batch / consignment at {locations.find(l => l.id === activeLocation)?.name})</p>

              <div className="space-y-8">
                {chainOfCustodySections.map((section, sIdx) => (
                  <div key={sIdx} className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">{section.title}</h3>
                    {renderChecklistTable(section.items.map((text, i) => ({ id: `coc-${activeLocation}-${sIdx}-${i}`, text })))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'fire' && (
            <div className="space-y-8 max-w-5xl">
              <div className="grid grid-cols-2 gap-6 mb-8 p-6 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Permit Number <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter permit number" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Serial Number <span className="text-red-500">*</span></label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter serial number" />
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Inspection Checklist ({locations.find(l => l.id === activeLocation)?.name})</h3>
              
              {renderChecklistTable([
                { id: `fe-${activeLocation}-1`, text: 'Ensure the fire extinguisher is in good condition, with no signs of damage, corrosion, or tampering.' },
                { id: `fe-${activeLocation}-2`, text: 'Check that the pressure gauge is in the green zone, indicating it is fully charged.' },
                { id: `fe-${activeLocation}-3`, text: 'Verify that the safety pin is intact and the handle is not damaged or bent.' },
                { id: `fe-${activeLocation}-4`, text: 'Ensure the hose/nozzle is free from clogs, cracks, or leaks.' }
              ])}
            </div>
          )}

          {activeTab === 'hostel' && (
            <div className="space-y-6 max-w-5xl">
              <div className="bg-blue-50 text-blue-800 font-bold py-2 px-4 rounded-lg uppercase tracking-wide text-sm border border-blue-200 inline-block mb-4">
                General Area ({locations.find(l => l.id === activeLocation)?.name})
              </div>

              {renderChecklistTable([
                { id: `ha-${activeLocation}-1`, text: 'Lighting adequate & operational' },
                { id: `ha-${activeLocation}-2`, text: 'Fan is functional & safe' },
                { id: `ha-${activeLocation}-3`, text: 'Stair treads, Entrance & Exit is clear & no obstructed and in good condition' },
                { id: `ha-${activeLocation}-4`, text: 'Electrical equipment, switches/sockets in good condition' },
                { id: `ha-${activeLocation}-5`, text: 'Switches and power sources are turn off after use' }
              ])}
            </div>
          )}

          {activeTab === 'cleanliness' && (
            <div className="space-y-8 max-w-5xl">
              <div className="grid grid-cols-2 gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">Nama Penyelia</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="Supervisor Name" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">Nama Pencuci</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="Cleaner Name" />
                </div>
              </div>

              <div className="bg-orange-100 text-orange-800 font-bold py-2 px-4 rounded-lg uppercase tracking-wide text-sm border border-orange-200 inline-block">
                Kawasan Jualan ({locations.find(l => l.id === activeLocation)?.name})
              </div>

              <div className="flex items-center gap-4 max-w-md">
                <label className="text-sm font-bold text-gray-700 uppercase w-32">Singkatan</label>
                <input type="text" className="flex-1 border border-gray-300 rounded-lg px-4 py-2" placeholder="Abbreviation" />
              </div>

              <div className="space-y-4 mt-6">
                {renderChecklistTable([
                  { id: `cl-${activeLocation}-1`, text: 'PEMBERSIHAN HABUK / MENGEMOP LANTAI KAYU, KARPET VAKUM' },
                  { id: `cl-${activeLocation}-2`, text: 'BERSIH KACA PINTU MASUK HADAPAN' },
                  { id: `cl-${activeLocation}-3`, text: 'SARANG LABAH-LABAH DIKELUARKAN DARIPADA TAPAK TIANG/SILING' },
                  { id: `cl-${activeLocation}-4`, text: 'LAPKAN BERSIH CABINET PAPARAN, PLATFORM DAN PAMERAN' },
                  { id: `cl-${activeLocation}-5`, text: 'HABUK DAN BERSIHKAN SEMUA LAMPU DAN WARNA (JIKA BERKENAAN)' },
                  { id: `cl-${activeLocation}-6`, text: 'BERSIHKAN SEMUA HABUK KERUSI, KERUSI ANAK TANGGA, BILIK PANGKALAN, KAYU KUMAI RENDAH, SILLS, BINGKAI GAMBAR, LEDGES DAN TEPI' }
                ])}
              </div>
            </div>
          )}

          {!['waste-id', 'chain-of-custody', 'fire', 'hostel', 'cleanliness'].includes(activeTab) && (
            <div className="space-y-8 max-w-5xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-900">{categories.find(c => c.id === activeTab)?.label} Checklist ({locations.find(l => l.id === activeLocation)?.name})</h3>
                <button 
                  onClick={() => handleGenerateChecklist(activeTab, categories.find(c => c.id === activeTab)?.label || '')}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGenerating ? 'Generating...' : 'Auto-Generate Checklist'}
                </button>
              </div>
              
              <div className="flex gap-4 mb-6">
                <input 
                  type="text" 
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  placeholder="Add a new checklist item..." 
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomItem(activeTab)}
                />
                <button 
                  onClick={() => handleAddCustomItem(activeTab)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors whitespace-nowrap"
                >
                  Add Item
                </button>
              </div>

              {renderChecklistTable(customItems[`${activeLocation}-${activeTab}`] || [])}
            </div>
          )}
        </div>
      </div>

      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={handleCapture} 
      />
    </div>
  );
}
