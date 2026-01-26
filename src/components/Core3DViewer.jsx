import React from 'react';
import Universal3DViewer from './Universal3DViewer';

/**
 * Core3D-specific 3D Viewer Component
 * Optimized for OpenNexus3DStudio and Core3D design workflows
 */
const Core3DViewer = ({ 
  design = null,
  model = null,
  material = null,
  renderMode = 'solid',
  showControls = true,
  showStats = false,
  onDesignLoad = null,
  onDesignError = null,
  className = '',
  style = {}
}) => {
  return (
    <div className={`core3d-viewer ${className}`} style={style}>
      <Universal3DViewer
        mode="opennexus3dstudio"
        model={design || model}
        renderMode={renderMode}
        showControls={showControls}
        showStats={showStats}
        enableCore3D={true}
        enableExport={true}
        onModelLoad={onDesignLoad}
        onModelError={onDesignError}
        className="opennexus3dstudio-viewer"
      />
    </div>
  );
};

export default Core3DViewer;
