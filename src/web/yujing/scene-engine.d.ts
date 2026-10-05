import type { YujingSettings, ThemeName, BottleStyle } from "../../shared/types";
export class SceneEngine {
 constructor(host: HTMLElement, onPick?: (index: number) => void, onFailure?: () => void);
 configure(settings: YujingSettings & { reading?: boolean; game?: boolean; focusedGame?: boolean; theme?: ThemeName }): void;
 quotes: string[];
 setWords(words: string[], lit?: Set<number>): void;
 energy: { bass: number; mid: number; high: number; level: number; bands?: Float32Array; transients?:Float32Array;beat?:number;flux?:number };
 onStar?: () => void;
 onBottle?: () => void;
 castBottle(style?: BottleStyle): void;
 collectBottle(): void;
 burst(index?: number): void;
 transition(): void;
 gust(quote?: string): void;
 dispose(): void;
 snapshot(): { coreFeedback: {pressed:boolean;hovered:boolean;scale?:number;opacity?:number}; triangles: number; renderFrames:number; time: number; theme?:ThemeName; palette:Record<string,string>; rings:number[][]; targets: Array<{ index: number; x: number; y: number; fontPixels?:number }>; energy: number; activeScene: string; visibleLayers: string[]; models: Record<string,string>; stars: number; planetCount: number; gust: number; pointer: number[]; smoothPointer:number[]; geometries:number };
}
