import * as THREE from 'three';
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader"
import { addModelData } from "./utils";
import {
  getMixamoAnimation,
  prepareVrmForMixamoRetarget,
  resolveVrmBoneTrackName,
} from './loadMixamoAnimation';
import { renameVRMBones } from './utils';
import { getAsArray, getFileNameWithoutExtension } from './utils';
import { loadStudioAnimationAtIndex } from './studioAnimations';

const MIXER_DELTA = 1 / 30;

/** Ensure Mixamo FBX skeleton world matrices are ready for retargeting. */
function prepareMixamoModel(mixamoModel) {
  if (!mixamoModel) return mixamoModel;
  mixamoModel.updateMatrixWorld(true);
  return mixamoModel;
}

/** Apply mixer pose to VRM skinned meshes (required for three-vrm humanoid rigs). */
function applyVrmHumanoidPose(vrm, delta = MIXER_DELTA) {
  if (!vrm) return;
  const humanoid = vrm.humanoid;
  if (humanoid?.update) {
    humanoid.update();
  } else if (humanoid && humanoid.autoUpdateHumanBones !== true) {
    humanoid.autoUpdateHumanBones = true;
    humanoid.update?.();
  }
  vrm.update?.(delta);
}

// make a class that hold all the informarion
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const interpolationTime = 0.2;

const getRandomInt = (max) => {
  return Math.floor(Math.random() * max);
}

class AnimationControl {
  constructor(animationManager, scene, vrm, animations, curIdx, lastIdx, poseStart){
    this.mixer = new THREE.AnimationMixer(scene);
    this.actions = [];
    this.to = null;
    this.from = null;
    this.vrm = vrm;
    this.animationManager = animationManager;
    this.mixamoModel = null;

    this.fadeOutActions = null;
    this.newAnimationWeight = 1;

    this.neckBone = vrm?.humanoid?.humanBones?.neck;
    this.spineBone = vrm?.humanoid?.humanBones?.spine;

    this.timeScale = 1;

    if (animations?.length){
      this.setAnimations(animations, null, null, poseStart );

      this.to = this.actions[curIdx] ?? null;

      if (lastIdx != -1 && this.actions[lastIdx]){
        this.from = this.actions[lastIdx];
        this.from.reset();
        this.from.time = animationManager.getFromActionTime();
        this.from.play();

        if (this.to) {
          this.to.weight = animationManager.getWeightIn();
        }
        this.from.weight = animationManager.getWeightOut();
      }

      if (this.actions[curIdx]) {
        this.actions[curIdx].reset();
        this.actions[curIdx].time = animationManager.getToActionTime();
        this.actions[curIdx].play();
      }
    }
  }

  setTimeScale(timeScale){
    this.timeScale = timeScale;
    this.actions.forEach(action => {
      action.timeScale = timeScale;
    });
  }

  setMouseLookEnabled(mouseLookEnabled){
    this.setAnimations(this.animations, this.mixamoModel, mouseLookEnabled);
  }

  setAnimations(animations, mixamoModel=null, mouseLookEnabled = null, quickChange = false){
    mouseLookEnabled = mouseLookEnabled == null ? this.animationManager.mouseLookEnabled : mouseLookEnabled;
    //this.mixer.stopAllAction();
    if (mixamoModel != null){
      prepareMixamoModel(mixamoModel);
      if (this.vrm != null){
        try {
          renameVRMBones(this.vrm);
        } catch {
          /* non-fatal — retarget may still work with raw bone names */
        }
        prepareVrmForMixamoRetarget(this.vrm);
        const mixamoAnimation = getMixamoAnimation(animations, mixamoModel , this.vrm);
        if (mixamoAnimation){
          animations = [mixamoAnimation]
          this.mixamoModel = mixamoModel;
        } else {
          console.warn('[AnimationManager] Mixamo retarget failed for VRM; clip will not play.');
          animations = [];
        }
      }
    } else{
      const cloneAnims = [];
      if (animations && Array.isArray(animations)) {
        animations.forEach(animation => {
          cloneAnims.push(animation.clone());
        });
        animations = cloneAnims;
      } else {
        animations = [];
      }
    }
    this.animations = animations;
    // modify animations
    if (mouseLookEnabled && animations.length > 0 && animations[0]?.tracks && this.vrm) {
      const neckNode = resolveVrmBoneTrackName(this.vrm, 'neck');
      const spineNode = resolveVrmBoneTrackName(this.vrm, 'spine');
      animations[0].tracks = animations[0].tracks.filter((track) => {
        const boneName = track.name.split('.')[0];
        return boneName !== neckNode && boneName !== spineNode;
      });
    }
    
    if (!quickChange){
      this.fadeOutActions = this.actions;
      this.actions = [];
      this.newAnimationWeight = 0;
      for (let i =0; i < animations.length;i++){
        const action = this.mixer.clipAction(animations[i]);
        action.timeScale = this.timeScale;
        this.actions.push(action);
      }
      if (this.actions.length > 0 && this.actions[0]) {
        this.actions[0].weight = 0;
        this.actions[0].play();
      }
    }
    else{
      this.actions.forEach(action => {
        action.weight = 0;
        action.stop();
      });
      this.actions = [];
      this.newAnimationWeight = 1;
      for (let i =0; i < animations.length;i++){
        const action = this.mixer.clipAction(animations[i]);
        action.timeScale = this.timeScale;
        this.actions.push(action);
      }
      if (this.actions[0]) {
        this.actions[0].weight = 1;
        this.actions[0].play();
      }
    }

    this.syncPlaybackActions(
      this.animationManager?.curAnimID ?? 0,
      this.animationManager?.lastAnimID ?? -1,
    );
  }

  /** Keep `to` / `from` aligned with the current clip after setAnimations or transport. */
  syncPlaybackActions(curIdx, lastIdx = -1) {
    if (!this.actions?.length) {
      this.to = null;
      this.from = null;
      return;
    }
    const idx = Math.min(Math.max(0, curIdx), this.actions.length - 1);
    this.to = this.actions[idx] ?? null;
    this.from = lastIdx >= 0 ? (this.actions[lastIdx] ?? null) : null;
    if (this.to && !this.to.isRunning()) {
      this.to.reset();
      this.to.play();
    }
  }

  update(weightIn,weightOut){
    if (this.fadeOutActions != null){
      this.newAnimationWeight += 1/5;
      this.fadeOutActions.forEach(action => {
        action.weight = 1 - this.newAnimationWeight;
      });

      if (this.newAnimationWeight >= 1){
        this.newAnimationWeight = 1;
        this.fadeOutActions.forEach(action => {
          action.weight = 0;
          action.stop();
        });
        this.fadeOutActions = null;
      }

      this.actions.forEach(action => {
        action.weight = this.newAnimationWeight;
      });
      
    }

    if (this.from != null) {
      this.from.weight = weightOut;
    }
    if (this.to != null) {
      this.to.weight = weightIn;
    }

    this.mixer.update(MIXER_DELTA);
    applyVrmHumanoidPose(this.vrm, MIXER_DELTA);
  }

  reset() {
    this.mixer.setTime(0);
    this.to.paused = true;
  }

  resume() {
    this.to.paused = false;
  }

  setTime(time){
    this.mixer.setTime(time);
  }

  getTime(){
    return this.mixer.time;
  }

  dispose(){
    this.animationManager.disposeAnimation(this);
  }
}

export class AnimationManager{
  constructor (){
    this.animationPaths = [];
    this.defaultAnimations = [];
    this.lastAnimID = null;
    this.mainControl = null;
    this.animationControl  = null;
    this.animations = null;
    this.paused = false;
    this.currentSpeed = 1;

    this.scale = 1;

    this.curLoadAnim = 0;
    this.currentAnimationName = "";
    
    this.weightIn = NaN; // note: can't set null, because of check `null < 1` will result `true`.
    this.weightOut = NaN;
    this.lastAnimID = -1;
    this.curAnimID = 0;
    this.animationControls = [];
    this.started = false;
    this.mouseLookEnabled = false;

    this.mixamoModel = null;
    this.mixamoAnimations = null;

    this.currentClip = null;
    /** @type {import('@pixiv/three-vrm').VRM | null} Sole VRM mixer target for playback */
    this.primaryAnimationVrm = null;
    /** @type {(() => void) | null} Re-register viewport VRM after clip load */
    this._viewportResync = null;

    setInterval(() => {
      this.update();
    }, 1000/30);
  }

  enableMouseLook(enable){
    this.mouseLookEnabled = enable;
    this._getActiveAnimationControls().forEach(animControls => {
      animControls.setMouseLookEnabled(enable);
    });
  }

  registerViewportResync(fn) {
    this._viewportResync = typeof fn === 'function' ? fn : null;
  }

  triggerPrimarySync() {
    this._viewportResync?.();
  }

  /** @param {import('@pixiv/three-vrm').VRM | null} vrm */
  setPrimaryAnimationVrm(vrm) {
    this.primaryAnimationVrm = vrm ?? null;
  }

  _getActiveAnimationControls() {
    const primary = this.primaryAnimationVrm;
    return this.animationControls.filter((control) => {
      if (!control.vrm) return true;
      return primary != null && control.vrm === primary;
    });
  }
  
  setScale (scale){
    this.scale = scale;
  }

  async loadAnimation(paths, isPose, poseTime = 0, isfbx = true, pathBase = "", name = ""){
    const path = pathBase + (pathBase != "" ? "/":"") + getAsArray(paths)[0];
    name = name == "" ? getFileNameWithoutExtension(path) : name;
    this.currentAnimationName = name;
    const loader = isfbx ? fbxLoader : gltfLoader;
    const animationModel = await loader.loadAsync(path);
    // if we have mixamo animations store the model
    animationModel.scale.set(this.scale,this.scale,this.scale)
    this._scaleOffsetHips(animationModel.animations);
    const clip = THREE.AnimationClip.findByName( animationModel.animations, 'mixamo.com' );
    
    if (clip != null){
      this.mixamoModel = prepareMixamoModel(animationModel.clone());
      this.mixamoAnimations =   animationModel.animations;
      this.currentClip = clip;
    }
    // if no mixamo animation is present, just save the animations
    else{
      this.mixamoModel = null
      this.animations = animationModel.animations;
      this.currentClip = animationModel.animations[0];
    }
    
    if (this.mainControl == null) {
      this.curAnimID = 0;
      this.lastAnimID = -1;
      this.mainControl = new AnimationControl(
        this,
        animationModel,
        null,
        animationModel.animations,
        this.curAnimID,
        this.lastAnimID,
        isPose,
      );
      this.animationControls.push(this.mainControl);
    }

    this.animationControls.forEach((animationControl) => {
      animationControl.setAnimations(
        animationModel.animations,
        this.mixamoModel,
        this.mouseLookEnabled,
        isPose,
      );
      animationControl.syncPlaybackActions(this.curAnimID, this.lastAnimID);
    });

    // Drop trait/accessory controls that could not retarget (no rig / partial VRM).
    const deadControls = this.animationControls.filter(
      (control) => control.vrm && !control.animations?.length,
    );
    deadControls.forEach((control) => this.disposeAnimation(control));

    this._viewportResync?.();

    this.setTime(poseTime);
    if (isPose) {
      this.stop();
    } else {
      this.currentSpeed = 1;
      this.play();
    }
  }

  getCurrentClip(){
    return this.currentClip;
      
  }

  getCurrentClipDuration(){
    return this.currentClip ? this.currentClip.duration : 0;
  }

  getCurrentAnimationName(){
    return this.currentAnimationName;
  }

  clearCurrentAnimations(){
    this.animationPaths = this.defaultAnimations;
    this.animationControls = [];
    this.mainControl = null;
    this.primaryAnimationVrm = null;
  }

  storeAnimationPaths(pathArray, pathBase, addDefaultAnimationPaths = true){
    const paths = getAsArray(pathArray);
    if (addDefaultAnimationPaths) {
        this.animationPaths = [...this.defaultAnimations, ...paths.map(path => `${pathBase}/${path}`)];
    } else {
        this.animationPaths = paths.map(path => pathBase != "" ? `${pathBase}/${path}` : path);
    }
  }

  storeDefaultAnimationPaths(pathArray, pathBase){
    const paths = getAsArray(pathArray);   
    this.defaultAnimations = paths.map(path => pathBase != "" ? `${pathBase}/${path}` : path);
    this.animationPaths = this.defaultAnimations;
  }

  loadNextAnimation(){
    if (this._studioAnimationEntries?.length) {
      const next = this.curLoadAnim >= this.animationPaths.length - 1 ? 0 : this.curLoadAnim + 1;
      return loadStudioAnimationAtIndex(this, next);
    }
    if (this.curLoadAnim == this.animationPaths.length-1)
      this.curLoadAnim = 0;
    else
      this.curLoadAnim++;
    this.loadAnimation(this.animationPaths[this.curLoadAnim])
  }

  loadPreviousAnimation(){
    if (this._studioAnimationEntries?.length) {
      const prev = this.curLoadAnim <= 0 ? this.animationPaths.length - 1 : this.curLoadAnim - 1;
      return loadStudioAnimationAtIndex(this, prev);
    }
    if (this.curLoadAnim == 0)
      this.curLoadAnim = this.animationPaths.length-1;
    else
      this.curLoadAnim--;
    this.loadAnimation(this.animationPaths[this.curLoadAnim])
  }

  enableScreenshot() {
    this._getActiveAnimationControls().forEach(control => {
      control.reset()
    }); 
  }

  disableScreenshot() {
    this._getActiveAnimationControls().forEach(control => {
      control.resume()
    }); 
  }

  _scaleOffsetHips(animations){
    animations.forEach(anim => {
      for (let i =0; i < anim.tracks.length; i++){
        const track = anim.tracks[i];
        if (track.name.includes(".position")){
          for (let j = 0; j < track.values.length/3 ; j++){
            const base = j*3;
            track.values[base] /= this.scale;
            track.values[base + 1] /= this.scale;
            track.values[base + 2] /= this.scale;
          }
        }
      }
    });
  }

  addVRM(vrm){
    if (vrm == null){
      console.error("Non Existing VRM was provided.")
      return;
    }

    const hips =
      vrm.humanoid?.getNormalizedBoneNode?.('hips') ??
      vrm.humanoid?.getRawBoneNode?.('hips');
    if (!hips) {
      return;
    }

    if (this.animationControls.some((control) => control.vrm === vrm)) {
      return;
    }

    try {
      renameVRMBones(vrm);
    } catch {
      /* continue with raw bone names */
    }
    prepareVrmForMixamoRetarget(vrm);

    let animations = null;
    if (this.mixamoModel != null && this.mixamoAnimations) {
      const mixamoRef = prepareMixamoModel(this.mixamoModel.clone());
      const retargeted = getMixamoAnimation(this.mixamoAnimations, mixamoRef, vrm);
      animations = retargeted ? [retargeted] : [];
      if (this.animations == null && retargeted) {
        this.animations = animations;
      }
    } else {
      animations = this.animations;
    }
    if (vrm?.humanoid && vrm.humanoid.autoUpdateHumanBones === false) {
      vrm.humanoid.autoUpdateHumanBones = true;
    }
    const animationControl = new AnimationControl(this, vrm.scene, vrm, animations, this.curAnimID, this.lastAnimID, this.isPaused())
    this.animationControls.push(animationControl);
    //this.animationControls.push({ vrm: vrm, animationControl: animationControl });

    //addModelData(vrm , {animationControl});
    if (this.started === false && animations){
      this.started = true;
      this.animRandomizer(animations[this.curAnimID].duration);
    }

    this.update(true);
    //animationControl.setTime(this.mainControl.getTime());
    //this.set
    // this.animationControls.forEach(animationControl => {
    //   animationControl.setAnimations(animationModel.animations, this.mixamoModel, this.mouseLookEnabled, isPose)
    // });
    // this.setTime(poseTime);
    // if(isPose)this.pause();
    // else this.play();
  }

  removeVRM(vrmToRemove) {
    const index = this.animationControls.findIndex((control) => control.vrm === vrmToRemove);

    if (index !== -1) {
        const removedControl = this.animationControls.splice(index, 1)[0];
        removedControl.dispose();
        if (this.primaryAnimationVrm === vrmToRemove) {
          this.primaryAnimationVrm = null;
        }
    }
  }
  
  getFromActionTime(){
    if (this.lastAnimID < 0 || !this.mainControl?.actions?.[this.lastAnimID]) {
      return 0;
    }
    return this.mainControl.actions[this.lastAnimID].time;
  }

  getToActionTime(){
    return this.mainControl ? this.mainControl.actions[this.curAnimID].time : 0.1;
  }

  getWeightIn(){
    return this.weightIn;
  }

  getWeightOut(){
    return this.weightOut;
  }
  
  disposeAnimation(targetAnimControl){
    if (targetAnimControl != null){
      const ind = this.animationControls.indexOf(targetAnimControl);
      if (ind != -1)
        this.animationControls.splice(ind,1);
    }
  }

  dispose(){
    this.animationControls.forEach(animControl => {
      animControl.dispose()
    });
  }

  animRandomizer(yieldTime){
    setTimeout(() => {
      this.lastAnimID = this.curAnimID;
      this.curAnimID = getRandomInt(this.animations.length);
      if (this.curAnimID != this.lastAnimID){
        
        this._getActiveAnimationControls().forEach(animControl => {
  
          animControl.from = animControl.actions[this.lastAnimID];
          animControl.to = animControl.actions[this.curAnimID];
  
          this.weightIn = 0;
          this.weightOut = 1;
          
          animControl.to.play();
          animControl.to.reset();
        })
      }
      this.animRandomizer(this.animations[this.curAnimID].duration - interpolationTime);
    }, (yieldTime * 1000));
  }

  pause(){
    this.paused = true;
  }

  play(){
    this.paused = false;
    if (!Number.isFinite(this.weightIn)) {
      this.weightIn = 1;
    }
    if (!Number.isFinite(this.weightOut)) {
      this.weightOut = 0;
    }
    const speed = this.currentSpeed === 0 ? 1 : this.currentSpeed;
    this._getActiveAnimationControls().forEach((control) => {
      control.syncPlaybackActions?.(this.curAnimID, this.lastAnimID);
      control.actions?.forEach((action) => {
        if (action?.paused) action.paused = false;
      });
      if (control.to?.paused) control.to.paused = false;
      if (control.from?.paused) control.from.paused = false;
    });
    if (this.currentSpeed === 0) {
      this.setSpeed(speed);
    }
    this.update(true);
  }
  stop(){
    this.pause();
    this.currentSpeed = 0;
    this.setSpeed(0);
    if (this.mainControl) {
      this._getActiveAnimationControls().forEach((animControl) => {
        animControl.setTime(0);
        animControl.actions?.forEach((action) => {
          action.time = 0;
        });
      });
      this.update(true);
    }
  }
  isPaused(){
    return this.paused;
  }
  getSpeed(){
    return this.currentSpeed;
  }
  getTime(){
    return this.mainControl?.getTime?.() ?? 0;
  }
  setTime(time){
    if (this.mainControl){
      this._getActiveAnimationControls().forEach(animControl => {
        animControl.setTime(time);
      });
    }
  }
  setFrame(frame){
    this.setTime(frame * 30);
  }
  setSpeed(speed){
    this.currentSpeed = speed;
    if (this.mainControl){
      this._getActiveAnimationControls().forEach(animControl => {
        animControl.setTimeScale(speed);
      });
    }
  }

  update(force=false){
    if ((this.mainControl && !this.paused)||force) {
      this._getActiveAnimationControls().forEach(animControl => {
        animControl.update(this.weightIn,this.weightOut);
      });

      if (this.weightIn < 1) {
        this.weightIn += 1/(30*interpolationTime);
      }
      else this.weightIn = 1;  
  
      if (this.weightOut > 0) this.weightOut -= 1/(30*interpolationTime);
      else this.weightOut = 0;
    }
  }

  /** Runtime diagnostics for animation playback smoke tests. */
  getPlaybackDiagnostics() {
    const vrmControls = this.animationControls.filter((c) => c.vrm);
    const activeControls = this._getActiveAnimationControls();
    return {
      paused: this.paused,
      currentAnimationName: this.currentAnimationName,
      hasMixamo: !!this.mixamoModel,
      mixamoClipName: this.currentClip?.name ?? null,
      controlCount: this.animationControls.length,
      activeControlCount: activeControls.length,
      primaryAnimationVrm: !!this.primaryAnimationVrm,
      vrmControlCount: vrmControls.length,
      vrmControls: vrmControls.map((c) => ({
        actionCount: c.actions?.length ?? 0,
        toWeight: c.to?.weight ?? null,
        toTime: c.to?.time ?? null,
        toPaused: c.to?.paused ?? null,
        mixerTime: c.getTime?.() ?? null,
        trackCount: c.animations?.[0]?.tracks?.length ?? 0,
        sampleTracks: (c.animations?.[0]?.tracks ?? []).slice(0, 3).map((t) => t.name),
        autoUpdateHumanBones: c.vrm?.humanoid?.autoUpdateHumanBones ?? null,
      })),
    };
  }
}

export { applyVrmHumanoidPose, prepareMixamoModel, MIXER_DELTA };