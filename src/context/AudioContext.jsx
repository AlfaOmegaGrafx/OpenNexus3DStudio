import React, {useState, createContext} from 'react';
export const AudioContext = createContext();
import bgm from "../sound/background/Gravity_of_Time.mp3"

export const AudioProvider = ({ children }) => {
    const [isMute, setMute] = useState(true);
    const [volume, setVolume] = useState(0.5);
    const audioRef = React.useRef(null);

    const handleVolumeChange = (newVolume) => {
        setVolume(newVolume);
        if (!isMute && audioRef.current) {
            audioRef.current.volume = newVolume;
        }
    };

    const enableAudio = () => {
        setMute(false);
        const audio = audioRef.current;
        
        // Reset audio to beginning
        audio.src = bgm;
        audio.currentTime = 0;
        audio.volume = volume;
        audio.loop = true; // Enable native looping
        
        // Start playing
        audio.play().catch(error => {
            console.error("Error playing audio:", error);
        });
    }

    const disableAudio = () => {
        setMute(true);
        const audio = audioRef.current;
        
        // Immediate mute
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0;
    }

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            const audio = audioRef.current;
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        };
    }, []);

    return (
        <AudioContext.Provider value={{
            isMute,
            setMute,
            volume,
            setVolume: handleVolumeChange,
            enableAudio,
            disableAudio
        }}>
            <audio ref={audioRef} />
            {children}
        </AudioContext.Provider>
    )
}