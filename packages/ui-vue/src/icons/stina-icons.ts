/**
 * Custom Stina icons for use with Iconify.
 * Usage: <Icon name="stina:head" />
 */
import { addIcon } from '@iconify/vue'

const icons: Record<string, { body: string; width: number; height: number }> = {
  head: {
    body: `<g transform="matrix(4.166667,0,0,4.166667,0,0)">
      <g transform="matrix(1.310698,0,0,1.310698,-159.077282,-131.466851)">
        <g transform="matrix(0.24,0,0,0.24,0,0)">
          <path d="M2687,3613C2616.918,3446.959 2610.503,3288.255 2609.599,3182.492" style="fill:none;stroke:currentColor;stroke-width:79.47px;"/>
        </g>
        <g transform="matrix(-0.24,0,0,0.24,1271.183749,0)">
          <path d="M3716.932,3613C3646.85,3446.959 3640.435,3288.255 3639.531,3182.492" style="fill:none;stroke:currentColor;stroke-width:79.47px;"/>
        </g>
        <g transform="matrix(0.247927,0,0,0.247927,-21.529281,24.473724)">
          <path d="M1745.43,617.16C1827.598,466.464 1987.469,364.121 2171.056,364.121C2438.425,364.121 2655.495,581.191 2655.495,848.561C2655.495,886.31 2651.168,923.057 2642.983,958.332" style="fill:none;stroke:currentColor;stroke-width:76.93px;"/>
        </g>
        <g transform="matrix(0.304821,0,0,0.288451,-113.19,-32.411974)">
          <path d="M1667.449,1011.571C1645.532,978.657 1624.787,953.125 1624,903C1622.154,785.458 1724.371,690 1848,690C2015.199,690 2080.943,866.002 2236.05,931.973" style="fill:none;stroke:currentColor;stroke-width:64.28px;"/>
        </g>
        <g transform="matrix(0.248958,0,0,0.233218,-19.109483,52.209675)">
          <path d="M1302.678,2135.326C1234.287,2005.204 1195.579,1857.087 1195.579,1700C1195.579,1182.439 1615.772,762.246 2133.333,762.246C2650.894,762.246 3071.087,1182.439 3071.087,1700C3071.087,1878.098 3021.331,2044.667 2934.973,2186.552" style="fill:none;stroke:currentColor;stroke-width:79.07px;"/>
        </g>
        <g transform="matrix(0.24,0,0,0.24,0,0)">
          <path d="M1301.168,2294.944C1250.801,2282.356 1107.33,2314.451 1136,2445C1159.735,2553.078 1181.888,2740.618 1360.878,2702.732" style="fill:none;stroke:currentColor;stroke-width:79.47px;"/>
        </g>
        <g transform="matrix(-0.24,0,0,0.24,598.350468,0)">
          <path d="M-472.372,2294.944C-522.739,2282.356 -666.21,2314.451 -637.54,2445C-613.804,2553.078 -591.652,2740.618 -412.661,2702.732" style="fill:none;stroke:currentColor;stroke-width:79.47px;"/>
        </g>
        <g transform="matrix(0.24,0,0,0.24,0,0)">
          <path d="M2623,1591C2623,1591 2520.418,1795.879 2008,1795C1495.582,1794.121 1290.975,2037.225 1300,2268C1314.448,2637.434 1387.388,2895.616 1593,3117C1775.87,3313.897 1933.581,3403 2133.333,3403C2333.086,3403 2490.797,3313.897 2673.667,3117C2879.278,2895.616 2952.219,2637.434 2966.667,2268C2973.887,2083.388 2846.366,1939.687 2736.039,1847.599C2599.432,1733.575 2623,1591 2623,1591Z" style="fill:none;stroke:currentColor;stroke-width:79.47px;"/>
        </g>
      </g>
    </g>`,
    width: 4267,
    height: 4267,
  },
}

/**
 * Registers all custom Stina icons with Iconify.
 * Call this once at app initialization.
 */
export function registerStinaIcons(): void {
  for (const [name, icon] of Object.entries(icons)) {
    addIcon(`stina:${name}`, icon)
  }
}
