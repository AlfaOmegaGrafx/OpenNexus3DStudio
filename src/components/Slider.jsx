import React, { useRef, useEffect } from 'react';
import styles from './Slider.module.css'; // Import CSS for styling

export default function Slider ({ title, value, min, max, onChange, step, stepBox }) {
  const sliderRef = useRef(null);
  
  // Calculate progress percentage for the blue fill indicator
  useEffect(() => {
    if (sliderRef.current) {
      const progress = ((value - min) / (max - min)) * 100;
      sliderRef.current.style.setProperty('--slider-progress', `${progress}%`);
    }
  }, [value, min, max]);
  
  return (
    <>
    <div className={styles["infoContainer"]}>   
    {title}
    {stepBox &&
        <input
          type="number"
          min="0"
          max="100"
          value={value}
          onChange={onChange}
          className={styles["input-box"]}
          step ={stepBox}
        />
      }
      </div>
    <div className={styles["slider-container"]}>
      <input
        ref={sliderRef}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        className={styles["slider"]}
        step ={step}
      />
      
    </div>
    </>
  );
};


