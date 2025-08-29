/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { UploadIcon, SwapIcon } from './icons';
import { identifyClothingItems } from '../services/geminiService';
import Spinner from './Spinner';

interface SwapPanelProps {
  onApplySwap: (clothingSourceImage: File, itemsToSwap: string[]) => void;
  isLoading: boolean;
}

const SwapPanel: React.FC<SwapPanelProps> = ({ onApplySwap, isLoading }) => {
  const [clothingSource, setClothingSource] = useState<{ file: File, url: string } | null>(null);
  const [identifiedItems, setIdentifiedItems] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isIdentifying, setIsIdentifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Effect to clean up object URL
  useEffect(() => {
    return () => {
      if (clothingSource) {
        URL.revokeObjectURL(clothingSource.url);
      }
    };
  }, [clothingSource]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Reset state for new upload
    setClothingSource(null);
    setIdentifiedItems([]);
    setSelectedItems([]);
    setError(null);
    setIsIdentifying(true);
    
    const newSource = { file, url: URL.createObjectURL(file) };
    setClothingSource(newSource);

    try {
      const items = await identifyClothingItems(file);
      if (items.length > 0) {
        setIdentifiedItems(items);
      } else {
        setError("Could not identify any clothing items in the image. Please try another one.");
        setClothingSource(null); // Clear the invalid image
        URL.revokeObjectURL(newSource.url);
      }
    } catch (err) {
      console.error('Identification failed:', err);
      setError("An error occurred while analyzing the image.");
      setClothingSource(null);
      URL.revokeObjectURL(newSource.url);
    } finally {
      setIsIdentifying(false);
    }
  }, []);

  const handleToggleItem = (itemToToggle: string) => {
    setSelectedItems(prev =>
      prev.includes(itemToToggle)
        ? prev.filter(item => item !== itemToToggle)
        : [...prev, itemToToggle]
    );
  };

  const handleReset = () => {
    if (clothingSource) {
        URL.revokeObjectURL(clothingSource.url);
    }
    setClothingSource(null);
    setIdentifiedItems([]);
    setSelectedItems([]);
    setError(null);
    setIsIdentifying(false);
  };
  
  const handleApply = () => {
    if (clothingSource && selectedItems.length > 0) {
      onApplySwap(clothingSource.file, selectedItems);
    }
  };

  const Uploader = () => (
    <div className="flex flex-col items-center gap-4 w-full">
        {error && (
             <div className="w-full text-center bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
             </div>
        )}
        <label 
          htmlFor="clothing-upload"
          className={`relative flex flex-col items-center justify-center w-full min-h-[10rem] p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDraggingOver ? 'bg-blue-500/20 border-blue-400' : 'bg-gray-800 border-gray-600 hover:border-gray-500 hover:bg-gray-700'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            handleFileSelect(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-col items-center justify-center text-center">
            <UploadIcon className="w-8 h-8 mb-4 text-gray-400" />
            <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
            <p className="text-xs text-gray-500">Upload an image of the desired outfit</p>
          </div>
          <input id="clothing-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e.target.files)} />
        </label>
    </div>
  );

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-300">Virtual Try-On</h3>
        <p className="text-sm text-gray-400 -mt-1">Upload a photo of an outfit, then select the items you want to swap.</p>
      </div>
      
      {!clothingSource && !isIdentifying && <Uploader />}
      
      {isIdentifying && (
        <div className="flex flex-col items-center justify-center gap-4 p-8">
            <Spinner />
            <p className="text-gray-300">AI is identifying clothing items...</p>
        </div>
      )}

      {clothingSource && !isIdentifying && identifiedItems.length > 0 && (
        <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-1/3 flex flex-col items-center gap-2">
                <img src={clothingSource.url} alt="Clothing source" className="w-full h-auto object-contain rounded-lg max-h-48"/>
                <button onClick={handleReset} className="text-sm text-gray-400 hover:text-white underline">
                    Use a different image
                </button>
            </div>
            <div className="md:w-2/3 flex flex-col gap-3">
                <p className="font-semibold text-gray-300">Select items to swap:</p>
                <div className="flex flex-wrap gap-2">
                    {identifiedItems.map(item => (
                        <button
                            key={item}
                            onClick={() => handleToggleItem(item)}
                            className={`px-4 py-2 rounded-md text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 capitalize ${
                                selectedItems.includes(item)
                                ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20' 
                                : 'bg-white/10 hover:bg-white/20 text-gray-200'
                            }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>
            </div>
        </div>
      )}

      {clothingSource && !isIdentifying && (
        <button
            onClick={handleApply}
            className="w-full mt-4 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            disabled={isLoading || selectedItems.length === 0}
        >
            <SwapIcon className="w-5 h-5"/>
            Apply Swap ({selectedItems.length} {selectedItems.length === 1 ? 'Item' : 'Items'})
        </button>
      )}

    </div>
  );
};

export default SwapPanel;
