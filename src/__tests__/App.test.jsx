import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock the context providers
vi.mock('../context/SceneContext', () => ({
  SceneProvider: ({ children }) => <div data-testid="scene-provider">{children}</div>,
  useScene: () => ({
    isInitialized: true,
    currentModel: null,
    renderMode: 'solid',
    isLoading: false,
    loadModel: vi.fn(),
    updateRenderMode: vi.fn(),
    clearModel: vi.fn(),
    exportModel: vi.fn(),
    startRenderLoop: vi.fn(),
    getSceneData: vi.fn()
  })
}));

vi.mock('../context/TaskContext', () => ({
  TaskProvider: ({ children }) => <div data-testid="task-provider">{children}</div>,
  useTask: () => ({
    isConnected: false,
    tasks: [],
    isLoading: false,
    checkConnection: vi.fn(),
    setApiEndpoint: vi.fn(),
    createAndStartTask: vi.fn(),
    removeTask: vi.fn(),
    clearCompletedTasks: vi.fn()
  })
}));

// Mock components
vi.mock('../components/Scene3D', () => ({
  default: () => <div data-testid="scene-3d">Scene3D Component</div>
}));

vi.mock('../components/TaskManager', () => ({
  default: () => <div data-testid="task-manager">TaskManager Component</div>
}));

vi.mock('../components/FileUpload', () => ({
  default: () => <div data-testid="file-upload">FileUpload Component</div>
}));

vi.mock('../components/RenderModeSelector', () => ({
  default: () => <div data-testid="render-mode-selector">RenderModeSelector Component</div>
}));

vi.mock('../components/APIStatus', () => ({
  default: () => <div data-testid="api-status">APIStatus Component</div>
}));

describe('App', () => {
  it('should render the main application', () => {
    render(<App />);
    
    expect(screen.getByText('OpenNexus3DStudio')).toBeInTheDocument();
    expect(screen.getByTestId('scene-provider')).toBeInTheDocument();
    expect(screen.getByTestId('task-provider')).toBeInTheDocument();
  });

  it('should render all main components', () => {
    render(<App />);
    
    expect(screen.getByTestId('scene-3d')).toBeInTheDocument();
    expect(screen.getByTestId('task-manager')).toBeInTheDocument();
    expect(screen.getByTestId('file-upload')).toBeInTheDocument();
    expect(screen.getByTestId('render-mode-selector')).toBeInTheDocument();
    expect(screen.getByTestId('api-status')).toBeInTheDocument();
  });

  it('should have proper app structure', () => {
    render(<App />);
    
    const app = screen.getByRole('application', { hidden: true }) || document.querySelector('.app');
    expect(app).toBeInTheDocument();
    
    const header = screen.getByText('OpenNexus3DStudio').closest('header');
    expect(header).toBeInTheDocument();
  });
});




