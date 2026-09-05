import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  findBoneRowInPanel,
  findVerticalScrollParent,
  scrollBoneRowJustBelowTitle,
  syncSidebarToBonePanelHeader,
  targetScrollLeftNudgeRight,
  targetScrollTopForRow,
} from '../library/boneStructurePanelScroll.js';

describe('scrollBoneRowJustBelowTitle', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="sidebar">
        <div class="bone-structure-panel">
          <div class="bone-panel-header sticky-header">Bone Structure</div>
          <div class="bone-structure-content" style="overflow-y: auto; height: 100px;">
            <div class="bone-tree">
              <div class="bone-item" data-bone-name="Hips">Hips</div>
              <div class="bone-item" data-bone-name="rightThumbProximal" data-bone-node-name="RightThumbProximal">
                <span class="bone-name">rightThumbProximal</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector('.bone-structure-content');
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 200 });
    content.scrollTop = 0;
    content.scrollLeft = 0;
    content.getBoundingClientRect = () => ({
      top: 50, left: 0, bottom: 150, right: 200, width: 200, height: 100,
    });
    const row = document.querySelector('[data-bone-name="rightThumbProximal"]');
    row.getBoundingClientRect = () => ({
      top: 180, left: 0, bottom: 200, right: 200, width: 200, height: 20,
    });
    const sidebar = document.querySelector('.sidebar');
    Object.defineProperty(sidebar, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(sidebar, 'scrollHeight', { configurable: true, value: 800 });
    sidebar.scrollTop = 100;
    sidebar.getBoundingClientRect = () => ({
      top: 0, left: 0, bottom: 400, right: 320, width: 320, height: 400,
    });
    document.querySelector('.bone-panel-header').getBoundingClientRect = () => ({
      top: 40, left: 0, bottom: 70, right: 300, width: 300, height: 30,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('pins the selected bone to the top of the content (under the title)', () => {
    const content = document.querySelector('.bone-structure-content');
    const row = document.querySelector('[data-bone-name="rightThumbProximal"]');
    const name = document.querySelector('.bone-name');
    row.getBoundingClientRect = () => {
      const top = 180 - content.scrollTop;
      return { top, left: 0, bottom: top + 20, right: 200, width: 200, height: 20 };
    };
    name.getBoundingClientRect = () => {
      const top = 180 - content.scrollTop;
      return { top, left: 10, bottom: top + 20, right: 110, width: 100, height: 20 };
    };
    expect(targetScrollTopForRow(row, content)).toBe(130);
    expect(scrollBoneRowJustBelowTitle('rightThumbProximal')).toBe('aligned');
    expect(content.scrollTop).toBe(130);
  });

  it('finds rows by node-name alias (viewport skeleton name)', () => {
    const content = document.querySelector('.bone-structure-content');
    content.scrollTop = 0;
    const row = document.querySelector('[data-bone-name="rightThumbProximal"]');
    const name = document.querySelector('.bone-name');
    row.getBoundingClientRect = () => {
      const top = 180 - content.scrollTop;
      return { top, left: 0, bottom: top + 20, right: 200, width: 200, height: 20 };
    };
    name.getBoundingClientRect = () => {
      const top = 180 - content.scrollTop;
      return { top, left: 10, bottom: top + 20, right: 110, width: 100, height: 20 };
    };
    expect(findBoneRowInPanel(document.querySelector('.bone-structure-panel'), 'RightThumbProximal')).toBe(row);
    expect(scrollBoneRowJustBelowTitle('RightThumbProximal')).toBe('aligned');
    expect(content.scrollTop).toBe(130);
  });

  it('syncs sidebar so the panel header sits at the sidebar top', () => {
    const panel = document.querySelector('.bone-structure-panel');
    const sidebar = document.querySelector('.sidebar');
    syncSidebarToBonePanelHeader(panel);
    expect(sidebar.scrollTop).toBe(140);
  });

  it('always scrolls .bone-structure-content, not a nested tree', () => {
    document.body.innerHTML = `
      <div class="bone-structure-panel">
        <div class="bone-panel-header sticky-header">Bone Structure</div>
        <div class="bone-structure-content" style="overflow-y: auto; height: 80px;">
          <div class="bone-tree" style="overflow-y: auto; height: 40px;">
            <div class="bone-item" data-bone-name="rightUpperArm">
              <span class="bone-name">rightUpperArm</span>
            </div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector('.bone-structure-content');
    const tree = document.querySelector('.bone-tree');
    const row = document.querySelector('[data-bone-name="rightUpperArm"]');
    const name = document.querySelector('.bone-name');
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 300 });
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 200 });
    Object.defineProperty(tree, 'clientHeight', { configurable: true, value: 40 });
    Object.defineProperty(tree, 'scrollHeight', { configurable: true, value: 200 });
    content.scrollTop = 0;
    tree.scrollTop = 0;
    content.getBoundingClientRect = () => ({
      top: 40, left: 0, bottom: 120, right: 200, width: 200, height: 80,
    });
    row.getBoundingClientRect = () => {
      const top = 40 + (200 - 40) - content.scrollTop;
      return { top, left: 0, bottom: top + 20, right: 200, width: 200, height: 20 };
    };
    name.getBoundingClientRect = () => {
      const top = 40 + (200 - 40) - content.scrollTop;
      return { top, left: 10, bottom: top + 20, right: 110, width: 100, height: 20 };
    };
    expect(targetScrollTopForRow(row, content)).toBe(160);
    expect(scrollBoneRowJustBelowTitle('rightUpperArm')).toBe('aligned');
    expect(content.scrollTop).toBe(160);
    expect(tree.scrollTop).toBe(0);
  });

  it('centers the selected bone name (moves bar right when row is on the right edge)', () => {
    document.body.innerHTML = `
      <div class="bone-structure-panel">
        <div class="bone-panel-header sticky-header">Bone Structure</div>
        <div class="bone-structure-content" style="overflow-x: auto; width: 200px;">
          <div class="bone-tree" style="width: 600px;">
            <div class="bone-item" data-bone-name="rightLowerArm">
              <span class="bone-name">rightLowerArm</span>
            </div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector('.bone-structure-content');
    const row = document.querySelector('[data-bone-name="rightLowerArm"]');
    const name = document.querySelector('.bone-name');
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 600 });
    content.scrollTop = 0;
    content.scrollLeft = 0;
    content.getBoundingClientRect = () => ({
      top: 0, left: 0, bottom: 100, right: 200, width: 200, height: 100,
    });
    name.getBoundingClientRect = () => {
      const left = 160 - content.scrollLeft;
      return { top: 0, left, bottom: 20, right: left + 120, width: 120, height: 20 };
    };
    row.getBoundingClientRect = () => {
      const left = 150 - content.scrollLeft;
      return { top: 0, left, bottom: 40, right: left + 180, width: 180, height: 40 };
    };
    expect(targetScrollLeftNudgeRight(row, content)).toBe(120);
    expect(scrollBoneRowJustBelowTitle('rightLowerArm')).toBe('aligned');
    expect(content.scrollLeft).toBe(120);
  });

  it('does not yank scrollLeft down to a tiny cap', () => {
    document.body.innerHTML = `
      <div class="bone-structure-panel">
        <div class="bone-panel-header sticky-header">Bone Structure</div>
        <div class="bone-structure-content">
          <div class="bone-tree" style="width: 800px;">
            <div class="bone-item" data-bone-name="rightLowerArm">
              <span class="bone-name">rightLowerArm</span>
            </div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector('.bone-structure-content');
    const row = document.querySelector('[data-bone-name="rightLowerArm"]');
    const name = document.querySelector('.bone-name');
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 100 });
    content.scrollLeft = 180;
    content.scrollTop = 0;
    content.getBoundingClientRect = () => ({
      top: 0, left: 0, bottom: 100, right: 200, width: 200, height: 100,
    });
    name.getBoundingClientRect = () => {
      const left = 250 - content.scrollLeft;
      return { top: 0, left, bottom: 20, right: left + 100, width: 100, height: 20 };
    };
    row.getBoundingClientRect = () => ({
      top: 0, left: 0, bottom: 40, right: 200, width: 200, height: 40,
    });
    const next = targetScrollLeftNudgeRight(row, content);
    expect(next).toBeGreaterThan(100);
    expect(next).toBeLessThanOrEqual(600);
  });

  it('keeps scrollLeft at 0 when nothing overflows', () => {
    document.body.innerHTML = `
      <div class="bone-structure-panel">
        <div class="bone-panel-header sticky-header">Bone Structure</div>
        <div class="bone-structure-content">
          <div class="bone-tree">
            <div class="bone-item" data-bone-name="LeftForeArm1">
              <span class="bone-name">LeftForeArm1</span>
            </div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector('.bone-structure-content');
    const row = document.querySelector('[data-bone-name="LeftForeArm1"]');
    const name = document.querySelector('.bone-name');
    Object.defineProperty(content, 'clientWidth', { configurable: true, value: 280 });
    Object.defineProperty(content, 'scrollWidth', { configurable: true, value: 280 });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 200 });
    content.scrollLeft = 0;
    content.scrollTop = 0;
    content.getBoundingClientRect = () => ({
      top: 0, left: 0, bottom: 200, right: 280, width: 280, height: 200,
    });
    row.getBoundingClientRect = () => ({
      top: 0, left: 8, bottom: 60, right: 260, width: 252, height: 60,
    });
    name.getBoundingClientRect = () => ({
      top: 0, left: 16, bottom: 20, right: 140, width: 124, height: 20,
    });
    expect(targetScrollLeftNudgeRight(row, content)).toBe(0);
    expect(scrollBoneRowJustBelowTitle('LeftForeArm1')).toBe('aligned');
    expect(content.scrollLeft).toBe(0);
  });

  it('findVerticalScrollParent still finds nested overflow for legacy callers', () => {
    document.body.innerHTML = `
      <div class="bone-structure-panel">
        <div class="bone-structure-content">
          <div class="bone-tree" style="overflow-y: auto; height: 80px;">
            <div class="bone-item" data-bone-name="Hips">Hips</div>
          </div>
        </div>
      </div>
    `;
    const tree = document.querySelector('.bone-tree');
    const item = document.querySelector('.bone-item');
    Object.defineProperty(tree, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(tree, 'scrollHeight', { configurable: true, value: 200 });
    expect(findVerticalScrollParent(item)).toBe(tree);
  });
});
