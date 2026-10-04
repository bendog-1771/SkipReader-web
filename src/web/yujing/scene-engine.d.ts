import type { YujingSettings } from "../../shared/types";
export class SceneEngine {
 constructor(host: HTMLElement, onPick?: (index: number) => void, onFailure?: () => void);
 configure(settings: YujingSettings & { reading?: boolean; game?: boolean }): void;
 quotes: string[];
 setWords(words: string[], lit?: Set<number>): void;
 energy: { bass: number; mid: number; high: number; level: number };
 burst(index?: number): void;
 transition(): void;
 gust(quote?: string): void;
 dispose(): void;
 snapshot(): { triangles: number; time: number; targets: Array<{ index: number; x: number; y: number }>; energy: number; activeScene: string; visibleLayers: string[]; models: Record<string,string>; stars: number; planetCount: number; gust: number; pointer: number[]; geometries:number };
}
