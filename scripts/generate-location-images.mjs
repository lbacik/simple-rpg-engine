/* eslint-disable */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../scenarios/whispering-woods/images');

fs.mkdirSync(outputDir, { recursive: true });

async function generateLocations() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://unpkg.com/roughjs@4.6.6/bundled/rough.js"></script>
      <style>
        body { margin: 0; background: #e8e8e6; }
        canvas { width: 640px; height: 360px; background: #f3f2ee; }
      </style>
    </head>
    <body>
      <canvas id="c" width="640" height="360"></canvas>
      <script>
        const canvas = document.getElementById('c');
        const rc = rough.canvas(canvas);
        const ctx = canvas.getContext('2d');

        function clear() {
          ctx.fillStyle = '#f3f2ee';
          ctx.fillRect(0, 0, 640, 360);
          drawBorders();
        }

        function drawBorders() {
          // Double sketched storybook frame
          rc.rectangle(14, 12, 612, 336, { stroke: '#222', strokeWidth: 2.2, roughness: 1.4 });
          rc.rectangle(20, 18, 600, 324, { stroke: '#555', strokeWidth: 0.8, roughness: 1.1 });
        }

        function tuft(x, y) {
          rc.line(x, y, x - 5, y - 14, { stroke: '#2b2b2b', strokeWidth: 1.5, roughness: 1.6 });
          rc.line(x, y, x + 1, y - 18, { stroke: '#2b2b2b', strokeWidth: 1.5, roughness: 1.6 });
          rc.line(x, y, x + 7, y - 13, { stroke: '#2b2b2b', strokeWidth: 1.5, roughness: 1.6 });
        }

        function drawFernClump(fx, fy) {
          for (let i = -2; i <= 2; i++) {
            rc.curve([[fx, fy], [fx + i * 12, fy - 25], [fx + i * 20, fy - 40]], { stroke: '#222', strokeWidth: 1.6, roughness: 1.4 });
            rc.line(fx + i * 8, fy - 15, fx + i * 16, fy - 22, { stroke: '#444', strokeWidth: 1.2 });
            rc.line(fx + i * 12, fy - 25, fx + i * 22, fy - 30, { stroke: '#444', strokeWidth: 1.2 });
          }
        }

        const locations = {
          // 1. Ashford: Village green, thatched cottages, stone well, distant woods
          'loc-ashford': function() {
            // Overcast sky hatching
            rc.line(40, 45, 260, 45, { stroke: '#bbb', strokeWidth: 1 });
            rc.line(320, 55, 590, 55, { stroke: '#bbb', strokeWidth: 1 });
            rc.line(70, 75, 480, 75, { stroke: '#ccc', strokeWidth: 1 });

            // Distant dark woods line on the horizon
            rc.polygon([[20, 155], [120, 140], [240, 148], [380, 138], [520, 146], [620, 140], [620, 180], [20, 180]], {
              fill: '#666', fillStyle: 'hachure', hachureAngle: 90, hachureGap: 3.5, stroke: '#333', strokeWidth: 1.4
            });

            // Rolling ground of the village green
            rc.curve([[20, 240], [180, 230], [360, 245], [620, 235]], { stroke: '#222', strokeWidth: 2, roughness: 1.4 });
            rc.polygon([[20, 240], [180, 230], [360, 245], [620, 235], [620, 342], [20, 342]], {
              fill: '#deded7', fillStyle: 'hachure', hachureAngle: -15, hachureGap: 9, stroke: 'none'
            });

            // Muddy cart ruts curving across the green
            rc.curve([[40, 320], [160, 295], [290, 290], [450, 310], [590, 325]], { stroke: '#666', strokeWidth: 1.8, roughness: 1.8 });
            rc.curve([[50, 332], [175, 307], [305, 302], [465, 322], [605, 337]], { stroke: '#777', strokeWidth: 1.5, roughness: 1.8 });

            // Left thatched cottage (Brenna's / elder's)
            rc.rectangle(45, 170, 120, 75, {
              fill: '#bcbcb6', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#222', strokeWidth: 2, roughness: 1.3
            });
            // Thatch roof
            rc.polygon([[35, 170], [105, 110], [175, 170]], {
              fill: '#85857f', fillStyle: 'hachure', hachureAngle: 50, hachureGap: 4.5, stroke: '#111', strokeWidth: 2.2, roughness: 1.4
            });
            // Timber beams
            rc.line(45, 205, 165, 205, { stroke: '#333', strokeWidth: 2 });
            rc.line(105, 170, 105, 245, { stroke: '#333', strokeWidth: 2 });
            // Closed door
            rc.rectangle(85, 205, 26, 40, { fill: '#4a4a45', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.8 });
            // Small shuttered window
            rc.rectangle(130, 185, 20, 20, { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.4 });

            // Right cottage (in midground)
            rc.rectangle(460, 165, 130, 80, {
              fill: '#b8b8b2', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#222', strokeWidth: 2, roughness: 1.3
            });
            rc.polygon([[448, 165], [525, 105], [602, 165]], {
              fill: '#85857f', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 4.5, stroke: '#111', strokeWidth: 2.2, roughness: 1.4
            });
            // Chimney with woodsmoke
            rc.rectangle(555, 95, 18, 30, { fill: '#666', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.5 });
            rc.curve([[564, 90], [568, 70], [560, 50], [572, 35]], { stroke: '#aaa', strokeWidth: 2, roughness: 1.8 });
            // Door and shutters
            rc.rectangle(480, 200, 24, 45, { fill: '#4a4a45', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.8 });
            rc.rectangle(535, 185, 22, 22, { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.4 });

            // Distant small cottage in center background
            rc.rectangle(205, 180, 70, 45, { fill: '#cfcfca', stroke: '#444', strokeWidth: 1.4 });
            rc.polygon([[198, 180], [240, 145], [282, 180]], { fill: '#999', stroke: '#333', strokeWidth: 1.6 });

            // CENTERPIECE: The Village Stone Well
            // Stone base ring
            rc.ellipse(320, 275, 115, 52, {
              fill: '#aba9a1', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#1a1a1a', strokeWidth: 2.4, roughness: 1.4
            });
            // Well opening shadow
            rc.ellipse(320, 273, 85, 34, { fill: '#222', fillStyle: 'solid', stroke: '#000', strokeWidth: 2 });
            // Stonework masonry lines
            for (let i = -40; i <= 40; i += 20) {
              rc.line(320 + i, 280, 320 + i + (i > 0 ? 6 : -6), 298, { stroke: '#333', strokeWidth: 1.5 });
            }
            // Vertical timber posts
            rc.rectangle(272, 175, 14, 100, { fill: '#554', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.rectangle(354, 175, 14, 100, { fill: '#554', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            // Wooden roof / crossbeam
            rc.polygon([[250, 175], [320, 125], [390, 175]], {
              fill: '#73736c', fillStyle: 'hachure', hachureAngle: 30, hachureGap: 4, stroke: '#111', strokeWidth: 2.2, roughness: 1.4
            });
            rc.line(250, 175, 390, 175, { stroke: '#111', strokeWidth: 2.5 });
            // Winch drum & rope
            rc.rectangle(286, 205, 68, 14, { fill: '#887', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.5 });
            rc.line(320, 219, 320, 260, { stroke: '#eee', strokeWidth: 2.2 });
            // Crank handle
            rc.line(368, 212, 385, 212, { stroke: '#111', strokeWidth: 3 });
            rc.line(385, 212, 385, 226, { stroke: '#111', strokeWidth: 3 });
            // Wooden bucket on the well coping
            rc.polygon([[345, 258], [365, 258], [362, 276], [348, 276]], {
              fill: '#665', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.6
            });
            rc.curve([[345, 258], [355, 248], [365, 258]], { stroke: '#222', strokeWidth: 1.6 });

            // Tufts of grass & stones around well
            tuft(240, 290);
            tuft(395, 295);
            tuft(190, 315);
            tuft(450, 320);
            tuft(110, 280);
            rc.circle(255, 310, 6, { fill: '#999', fillStyle: 'solid', stroke: '#333' });
            rc.circle(385, 315, 8, { fill: '#888', fillStyle: 'solid', stroke: '#333' });
          },

          // 2. Forest Edge: Ancient wall of murmuring oaks, rutted track ending
          'loc-forest-edge': function() {
            // Fields ground on left leading up to woods
            rc.polygon([[20, 220], [280, 230], [620, 250], [620, 342], [20, 342]], {
              fill: '#dcdccf', fillStyle: 'hachure', hachureAngle: -20, hachureGap: 8, stroke: 'none'
            });

            // Cart track entering the woods
            rc.curve([[30, 335], [150, 305], [260, 275], [360, 260], [420, 255]], { stroke: '#444', strokeWidth: 2.5, roughness: 1.8 });
            rc.curve([[60, 342], [180, 315], [285, 285], [375, 270], [430, 265]], { stroke: '#555', strokeWidth: 2, roughness: 1.8 });

            // Background tree silhouettes (depth)
            rc.polygon([[200, 240], [260, 80], [330, 240]], { fill: '#777', fillStyle: 'hachure', hachureAngle: 75, hachureGap: 3, stroke: '#555' });
            rc.polygon([[310, 240], [380, 60], [460, 240]], { fill: '#666', fillStyle: 'hachure', hachureAngle: -75, hachureGap: 3, stroke: '#444' });
            rc.polygon([[430, 240], [510, 70], [600, 240]], { fill: '#555', fillStyle: 'hachure', hachureAngle: 85, hachureGap: 3, stroke: '#333' });

            // Giant Ancient Oak #1 (Center-Left)
            rc.polygon([[150, 270], [180, 160], [170, 70], [215, 70], [225, 170], [260, 265]], {
              fill: '#45453f', fillStyle: 'cross-hatch', hachureGap: 4.5, stroke: '#1a1a1a', strokeWidth: 2.8, roughness: 1.5
            });
            // Sprawling massive branches
            rc.curve([[180, 160], [120, 120], [60, 110]], { stroke: '#222', strokeWidth: 4.5, roughness: 1.4 });
            rc.curve([[190, 130], [240, 95], [320, 85]], { stroke: '#222', strokeWidth: 4, roughness: 1.4 });
            rc.curve([[175, 90], [110, 60], [70, 45]], { stroke: '#222', strokeWidth: 3.5, roughness: 1.4 });

            // Giant Ancient Oak #2 (Right Foreground)
            rc.polygon([[440, 280], [480, 140], [470, 50], [530, 50], [545, 150], [595, 275]], {
              fill: '#383833', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 3, roughness: 1.6
            });
            // Massive branches arching across
            rc.curve([[480, 140], [410, 100], [330, 110]], { stroke: '#1a1a1a', strokeWidth: 5, roughness: 1.4 });
            rc.curve([[500, 110], [440, 65], [360, 50]], { stroke: '#1a1a1a', strokeWidth: 4, roughness: 1.4 });
            rc.curve([[530, 120], [590, 90], [620, 95]], { stroke: '#1a1a1a', strokeWidth: 4, roughness: 1.4 });

            // Canopy clusters (dense oak foliage)
            const canopies = [
              [80, 70, 110, 60], [160, 50, 120, 70], [260, 55, 130, 75],
              [350, 60, 120, 70], [450, 45, 140, 80], [560, 60, 130, 75],
              [120, 105, 90, 55], [390, 95, 100, 60]
            ];
            for (const [cx, cy, cw, ch] of canopies) {
              rc.ellipse(cx, cy, cw, ch, {
                fill: '#2a2a26', fillStyle: 'cross-hatch', hachureGap: 3.5, stroke: '#111', strokeWidth: 2, roughness: 1.6
              });
            }

            // Gnarled roots crawling over the trail
            rc.curve([[160, 260], [130, 275], [90, 280]], { stroke: '#222', strokeWidth: 3.2 });
            rc.curve([[250, 260], [290, 270], [330, 265]], { stroke: '#222', strokeWidth: 3.5 });
            rc.curve([[450, 275], [400, 280], [370, 275]], { stroke: '#222', strokeWidth: 3.2 });
            rc.curve([[580, 270], [610, 285]], { stroke: '#222', strokeWidth: 3 });

            // Murmuring wind streams & drifting leaves
            rc.curve([[80, 160], [180, 175], [280, 150], [380, 165], [480, 145]], { stroke: '#888', strokeWidth: 1.6, roughness: 2 });
            rc.curve([[120, 195], [230, 210], [340, 185], [450, 200]], { stroke: '#999', strokeWidth: 1.4, roughness: 2 });
            for (let i = 0; i < 16; i++) {
              const lx = 90 + (i * 27) % 450;
              const ly = 120 + (i * 19) % 110;
              rc.ellipse(lx, ly, 10, 6, { fill: '#666', stroke: '#222', strokeWidth: 1.2, roughness: 1.5 });
              rc.line(lx - 4, ly, lx + 4, ly, { stroke: '#222', strokeWidth: 1 });
            }

            // Briars, ferns and tufts along the edge
            drawFernClump(70, 310);
            drawFernClump(380, 290);
            tuft(110, 325);
            tuft(280, 310);
            tuft(490, 315);
          },

          // 3. Hunters' Camp: Clearing, branch lean-to, blackened firepit, pine trees
          'loc-hunters-camp': function() {
            // Pine forest background
            for (let i = 0; i < 9; i++) {
              const px = 40 + i * 65;
              const ph = 180 + (i % 3) * 30;
              rc.line(px, 240, px, 240 - ph, { stroke: '#444', strokeWidth: 3.5, roughness: 1.2 });
              // Pine foliage layers
              for (let layer = 0; layer < 4; layer++) {
                const ly = 240 - ph + layer * 35;
                const lw = 25 + layer * 15;
                rc.polygon([[px - lw, ly + 25], [px, ly], [px + lw, ly + 25]], {
                  fill: '#666', fillStyle: 'hachure', hachureAngle: 60, hachureGap: 3, stroke: '#333', strokeWidth: 1.4
                });
              }
            }

            // Clearing ground covered in pine needles
            rc.polygon([[20, 235], [200, 225], [420, 230], [620, 225], [620, 342], [20, 342]], {
              fill: '#d2d0c7', fillStyle: 'hachure', hachureAngle: 15, hachureGap: 8, stroke: 'none'
            });
            rc.curve([[20, 235], [200, 225], [420, 230], [620, 225]], { stroke: '#222', strokeWidth: 2 });

            // THE LEAN-TO (Left-Center)
            // Support tree on left and right
            rc.line(100, 260, 100, 50, { stroke: '#222', strokeWidth: 6, roughness: 1.3 });
            rc.line(300, 260, 300, 70, { stroke: '#222', strokeWidth: 5, roughness: 1.3 });
            // Horizontal ridgepole
            rc.line(95, 120, 305, 135, { stroke: '#111', strokeWidth: 4.5, roughness: 1.2 });
            // Slanted poles forming roof
            for (let i = 0; i < 11; i++) {
              const rx = 105 + i * 19;
              const ry = 121 + i * 1.4;
              rc.line(rx, ry, rx - 35, ry + 120, { stroke: '#1a1a1a', strokeWidth: 3, roughness: 1.4 });
            }
            // Roof boughs and bark covering
            rc.polygon([[70, 240], [100, 120], [305, 135], [270, 255]], {
              fill: '#7a7a72', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2, roughness: 1.5
            });
            // Dark sheltered interior
            rc.polygon([[100, 240], [105, 135], [295, 145], [285, 245]], {
              fill: '#2b2b27', fillStyle: 'solid', stroke: 'none'
            });
            // Split-log bench inside
            rc.rectangle(130, 215, 110, 18, { fill: '#887', fillStyle: 'solid', stroke: '#fff', strokeWidth: 1.4 });
            // Bedding of dry bracken
            rc.polygon([[120, 235], [270, 235], [260, 250], [110, 250]], {
              fill: '#a8a89e', fillStyle: 'hachure', hachureAngle: -30, hachureGap: 3, stroke: '#444'
            });

            // THE BLACKENED FIREPIT (Right-Center)
            // Ring of charred river stones
            const stones = [
              [420, 265, 18, 12], [440, 260, 20, 13], [465, 260, 19, 14], [485, 265, 18, 13],
              [495, 275, 19, 14], [485, 286, 21, 15], [460, 292, 22, 14], [435, 290, 20, 14],
              [415, 278, 18, 13]
            ];
            for (const [sx, sy, sw, sh] of stones) {
              rc.ellipse(sx, sy, sw, sh, {
                fill: '#6b6b66', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.8, roughness: 1.3
              });
            }
            // Cold ash center
            rc.ellipse(455, 275, 55, 25, { fill: '#222', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.5 });
            // Charred firewood remnants
            rc.line(435, 270, 475, 280, { stroke: '#555', strokeWidth: 3.5 });
            rc.line(440, 282, 470, 268, { stroke: '#555', strokeWidth: 3.2 });
            rc.line(455, 263, 455, 287, { stroke: '#444', strokeWidth: 3 });

            // Tree stump with woodsman wedge / abandoned log
            rc.rectangle(345, 255, 32, 25, { fill: '#776', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.6 });
            rc.ellipse(361, 255, 32, 12, { fill: '#aaa', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.6 });

            // Abandoned tin pot near fire
            rc.rectangle(515, 270, 14, 16, { fill: '#999', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.4 });
            rc.ellipse(522, 270, 14, 6, { fill: '#555', fillStyle: 'solid', stroke: '#222' });

            // Tufts and pine needles
            tuft(70, 280);
            tuft(330, 295);
            tuft(550, 285);
            tuft(420, 320);
          },

          // 4. Wolf Hollow: Steep ravine, fallen beech with giant root plate, gnawed bones, sea of ferns
          'loc-wolf-hollow': function() {
            // Steep ravine banks sloping down from both sides
            rc.polygon([[20, 160], [180, 240], [420, 245], [620, 170], [620, 342], [20, 342]], {
              fill: '#cecec5', fillStyle: 'hachure', hachureAngle: -25, hachureGap: 8, stroke: 'none'
            });
            rc.curve([[20, 160], [180, 240], [420, 245], [620, 170]], { stroke: '#222', strokeWidth: 2.2, roughness: 1.5 });

            // Background shadowed woods in hollow
            rc.polygon([[20, 160], [180, 240], [420, 245], [620, 170], [620, 50], [20, 50]], {
              fill: '#55554f', fillStyle: 'hachure', hachureAngle: 80, hachureGap: 4, stroke: 'none'
            });

            // MASSIVE FALLEN BEECH TRUNK (Lying across center-right)
            rc.polygon([[190, 225], [490, 185], [510, 215], [195, 265]], {
              fill: '#5c5c56', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.8, roughness: 1.5
            });
            // Bark peel and fungus brackets on trunk
            rc.ellipse(320, 205, 20, 8, { fill: '#bbb', fillStyle: 'solid', stroke: '#222' });
            rc.ellipse(370, 198, 25, 9, { fill: '#bbb', fillStyle: 'solid', stroke: '#222' });
            rc.ellipse(430, 192, 18, 7, { fill: '#bbb', fillStyle: 'solid', stroke: '#222' });

            // GIANT TORN ROOT PLATE (Left)
            // Shadowy den hollow beneath roots
            rc.ellipse(150, 250, 110, 50, { fill: '#1a1a18', fillStyle: 'solid', stroke: '#000', strokeWidth: 2 });
            // Tangled root network
            const rootCurves = [
              [[190, 230], [160, 140], [120, 95], [80, 90]],
              [[185, 240], [140, 170], [80, 130], [50, 140]],
              [[170, 250], [130, 200], [60, 180], [35, 210]],
              [[195, 220], [180, 120], [150, 80], [120, 60]],
              [[160, 180], [110, 130], [90, 90]],
              [[140, 210], [90, 180], [50, 170]]
            ];
            for (const pts of rootCurves) {
              rc.curve(pts, { stroke: '#222', strokeWidth: 4, roughness: 1.6 });
              rc.curve(pts, { stroke: '#444', strokeWidth: 2, roughness: 1.3 });
            }

            // GNAWED BONES (Protruding from roots and soil in front of den)
            // Rib cage bones
            for (let i = 0; i < 5; i++) {
              const bx = 220 + i * 16;
              const by = 265 + i * 3;
              rc.curve([[bx, by], [bx - 6, by - 18], [bx + 4, by - 26]], { stroke: '#eee', strokeWidth: 2.2, roughness: 1.2 });
              rc.curve([[bx, by], [bx - 6, by - 18], [bx + 4, by - 26]], { stroke: '#222', strokeWidth: 0.8 });
            }
            // Beast / deer skull
            rc.polygon([[290, 285], [315, 275], [325, 290], [300, 298]], {
              fill: '#f0f0ea', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.8
            });
            rc.circle(302, 284, 3, { fill: '#111', fillStyle: 'solid' }); // Eye socket
            rc.line(315, 275, 335, 255, { stroke: '#ddd', strokeWidth: 2 }); // Horn/antler spike
            rc.line(325, 290, 345, 278, { stroke: '#ddd', strokeWidth: 1.8 });

            // SEA OF FERNS (Choking the hollow floor)
            const fernSpots = [
              [50, 305], [90, 285], [140, 315], [180, 300], [240, 325],
              [350, 310], [390, 285], [440, 305], [490, 275], [540, 295],
              [580, 265], [310, 255], [460, 245], [520, 230]
            ];
            for (const [fx, fy] of fernSpots) {
              drawFernClump(fx, fy);
            }
          },

          // 5. Ruined Chapel: Exterior of roofless stone chapel, crumbling gothic windows, ivy-swallowed doorway
          'loc-ruined-chapel': function() {
            // Sky seen through roofless ruins
            rc.line(60, 45, 580, 45, { stroke: '#ccc', strokeWidth: 1 });
            rc.line(90, 65, 550, 65, { stroke: '#ddd', strokeWidth: 1 });

            // Ground with fallen flagstones and rubble
            rc.polygon([[20, 260], [200, 250], [420, 255], [620, 245], [620, 342], [20, 342]], {
              fill: '#d6d6ce', fillStyle: 'hachure', hachureAngle: -10, hachureGap: 9, stroke: 'none'
            });
            rc.curve([[20, 260], [200, 250], [420, 255], [620, 245]], { stroke: '#222', strokeWidth: 2 });

            // MAIN RUINED STONE WALLS (Gothic facade)
            // Left jagged wall tower
            rc.polygon([[100, 265], [100, 105], [120, 75], [145, 110], [170, 85], [190, 115], [190, 260]], {
              fill: '#b8b8b0', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#1a1a1a', strokeWidth: 2.4, roughness: 1.4
            });

            // Right jagged wall
            rc.polygon([[450, 260], [450, 100], [475, 70], [500, 110], [530, 80], [550, 120], [550, 260]], {
              fill: '#b8b8b0', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#1a1a1a', strokeWidth: 2.4, roughness: 1.4
            });

            // Center connecting wall with open roofline
            rc.polygon([[190, 260], [190, 125], [240, 120], [400, 120], [450, 125], [450, 260]], {
              fill: '#a8a8a0', fillStyle: 'cross-hatch', hachureGap: 5.5, stroke: '#1a1a1a', strokeWidth: 2.4, roughness: 1.4
            });

            // Stone block masonry courses
            for (let y = 140; y < 250; y += 22) {
              rc.line(100, y, 190, y, { stroke: '#444', strokeWidth: 1.2 });
              rc.line(450, y, 550, y, { stroke: '#444', strokeWidth: 1.2 });
            }

            // GOTHIC ARCHED WINDOWS (Broken tracery open to sky)
            // Left window
            rc.polygon([[125, 200], [125, 140], [145, 115], [165, 140], [165, 200]], {
              fill: '#f3f2ee', fillStyle: 'solid', stroke: '#111', strokeWidth: 2
            });
            rc.line(145, 115, 145, 200, { stroke: '#333', strokeWidth: 1.5 });

            // Right window
            rc.polygon([[485, 200], [485, 140], [505, 115], [525, 140], [525, 200]], {
              fill: '#f3f2ee', fillStyle: 'solid', stroke: '#111', strokeWidth: 2
            });
            rc.line(505, 115, 505, 200, { stroke: '#333', strokeWidth: 1.5 });

            // GREAT ARCHED PORTAL / DOORWAY (Center)
            // Outer concentric stone arch
            rc.polygon([[250, 260], [250, 180], [320, 130], [390, 180], [390, 260]], {
              fill: '#8c8c84', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.5
            });
            // Inner open arch leading into dark interior
            rc.polygon([[275, 260], [275, 190], [320, 150], [365, 190], [365, 260]], {
              fill: '#1a1a18', fillStyle: 'solid', stroke: '#000', strokeWidth: 2
            });

            // GLIMPSE OF THE STONE ALTAR THROUGH PORTAL
            rc.rectangle(295, 230, 50, 24, { fill: '#deded7', fillStyle: 'solid', stroke: '#fff', strokeWidth: 1.6 });
            rc.line(290, 230, 350, 230, { stroke: '#fff', strokeWidth: 2 });

            // THICK CLIMBING IVY (Swallowing the carvings and walls)
            const ivyVines = [
              [[240, 265], [245, 210], [255, 170], [270, 145], [300, 135]],
              [[400, 265], [395, 210], [385, 170], [370, 145], [340, 135]],
              [[95, 240], [105, 180], [115, 130], [130, 95]],
              [[555, 250], [545, 190], [535, 140], [515, 105]]
            ];
            for (const vine of ivyVines) {
              rc.curve(vine, { stroke: '#111', strokeWidth: 3.5, roughness: 1.4 });
              // Ivy leaf clusters along vine
              for (let i = 1; i < vine.length; i++) {
                const [vx, vy] = vine[i];
                rc.circle(vx - 6, vy, 10, { fill: '#3b3b35', fillStyle: 'solid', stroke: '#111' });
                rc.circle(vx + 6, vy + 4, 9, { fill: '#3b3b35', fillStyle: 'solid', stroke: '#111' });
              }
            }

            // Rubble, fallen carved masonry stones, weeds in foreground
            rc.rectangle(160, 280, 28, 16, { fill: '#999', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.6 });
            rc.rectangle(420, 285, 32, 18, { fill: '#888', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.6 });
            rc.circle(230, 295, 8, { fill: '#777', fillStyle: 'solid', stroke: '#222' });
            rc.circle(380, 305, 10, { fill: '#777', fillStyle: 'solid', stroke: '#222' });
            tuft(80, 290);
            tuft(280, 310);
            tuft(480, 305);
            tuft(570, 280);
          },

          // 6. Barrow Mound: Grassy earthen mound, standing megaliths on summit, rune-carved slab portal
          'loc-barrow-mound': function() {
            // Sky with windswept cloud hatching
            rc.line(30, 35, 310, 35, { stroke: '#bbb', strokeWidth: 1 });
            rc.line(350, 45, 600, 45, { stroke: '#bbb', strokeWidth: 1 });
            rc.line(70, 60, 520, 60, { stroke: '#ccc', strokeWidth: 1 });

            // THE GREAT BARROW MOUND (Curved grassy hill profile)
            rc.curve([[20, 270], [120, 210], [320, 125], [520, 210], [620, 270]], {
              stroke: '#111', strokeWidth: 2.8, roughness: 1.4
            });
            rc.polygon([[20, 270], [120, 210], [320, 125], [520, 210], [620, 270], [620, 342], [20, 342]], {
              fill: '#d4d4cb', fillStyle: 'hachure', hachureAngle: -25, hachureGap: 8, stroke: 'none'
            });

            // STANDING MEGALITHS ON THE SUMMIT
            const megaliths = [
              [[230, 140], [235, 75], [250, 70], [255, 140]],
              [[275, 130], [280, 60], [298, 55], [305, 130]],
              [[325, 125], [330, 50], [352, 45], [358, 125]], // Tallest center stone
              [[380, 132], [385, 65], [402, 60], [408, 132]],
              [[430, 145], [435, 80], [450, 75], [455, 145]]
            ];
            for (const pts of megaliths) {
              rc.polygon(pts, {
                fill: '#5a5a54', fillStyle: 'cross-hatch', hachureGap: 3.5, stroke: '#111', strokeWidth: 2.2, roughness: 1.4
              });
            }

            // Windswept hill grass tufts across the mound slopes
            tuft(160, 215);
            tuft(210, 180);
            tuft(430, 185);
            tuft(480, 220);
            tuft(100, 260);
            tuft(540, 265);

            // THE PORTAL AT THE FOOT OF THE MOUND
            // Heavy stone megalith portal frame
            rc.rectangle(260, 205, 24, 85, { fill: '#73736b', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2 });
            rc.rectangle(356, 205, 24, 85, { fill: '#73736b', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2 });
            // Massive lintel stone across top
            rc.polygon([[245, 205], [255, 180], [385, 180], [395, 205]], {
              fill: '#85857c', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.4, roughness: 1.3
            });

            // Dark portal recess
            rc.rectangle(284, 205, 72, 85, { fill: '#1a1a18', fillStyle: 'solid', stroke: '#000', strokeWidth: 2 });

            // THE GREY SLAB DOOR CARVED WITH RUNES
            rc.rectangle(286, 208, 68, 80, {
              fill: '#b0b0a8', fillStyle: 'cross-hatch', hachureGap: 4.5, stroke: '#111', strokeWidth: 2
            });
            // Carved spiral runes on the slab face
            rc.curve([[320, 230], [328, 238], [320, 246], [312, 238], [320, 225], [334, 238], [320, 252]], {
              stroke: '#222', strokeWidth: 2, roughness: 1.4
            });
            // Ancient rune marks
            rc.line(300, 220, 300, 245, { stroke: '#222', strokeWidth: 2 });
            rc.line(300, 225, 310, 220, { stroke: '#222', strokeWidth: 1.8 });
            rc.line(300, 235, 310, 230, { stroke: '#222', strokeWidth: 1.8 });

            rc.line(340, 220, 340, 245, { stroke: '#222', strokeWidth: 2 });
            rc.line(340, 225, 330, 232, { stroke: '#222', strokeWidth: 1.8 });
            rc.line(340, 232, 330, 240, { stroke: '#222', strokeWidth: 1.8 });

            rc.line(305, 265, 335, 265, { stroke: '#222', strokeWidth: 2 });
            rc.line(320, 255, 320, 275, { stroke: '#222', strokeWidth: 2 });

            // Stone threshold steps and trodden path leading to portal
            rc.rectangle(270, 288, 100, 12, { fill: '#999', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.8 });
            rc.rectangle(255, 300, 130, 14, { fill: '#888', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.8 });
            rc.curve([[255, 314], [220, 335]], { stroke: '#444', strokeWidth: 2 });
            rc.curve([[385, 314], [420, 335]], { stroke: '#444', strokeWidth: 2 });
          },

          // 7. Barrow Tomb: Low subterranean crypt, stone pillars, raised bier with wight in mail, sleeping girl in nest of grave-cloths
          'loc-barrow-tomb': function() {
            // Deep subterranean dark background
            rc.polygon([[20, 20], [620, 20], [620, 340], [20, 340]], {
              fill: '#20201e', fillStyle: 'solid', stroke: 'none'
            });

            // Heavy horizontal stone ceiling slabs
            rc.rectangle(20, 20, 600, 45, {
              fill: '#3a3a36', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#555', strokeWidth: 2
            });
            for (let x = 120; x < 600; x += 110) {
              rc.line(x, 20, x, 65, { stroke: '#111', strokeWidth: 2.5 });
            }

            // Flagstone floor with uneven stone joints
            rc.polygon([[20, 265], [620, 265], [620, 340], [20, 340]], {
              fill: '#333330', fillStyle: 'hachure', hachureAngle: 10, hachureGap: 7, stroke: '#666', strokeWidth: 1.8
            });
            for (let y = 285; y < 340; y += 22) {
              rc.line(20, y, 620, y, { stroke: '#222', strokeWidth: 1.5 });
            }
            for (let x = 60; x < 620; x += 85) {
              rc.line(x, 265, x, 340, { stroke: '#222', strokeWidth: 1.5 });
            }

            // MASSIVE STONE PILLARS (Columns framing the tomb)
            // Left pillar
            rc.rectangle(60, 65, 55, 205, {
              fill: '#454540', fillStyle: 'cross-hatch', hachureGap: 4.5, stroke: '#777', strokeWidth: 2.2, roughness: 1.3
            });
            rc.rectangle(50, 60, 75, 14, { fill: '#666', stroke: '#888', strokeWidth: 1.8 });
            rc.rectangle(50, 255, 75, 15, { fill: '#666', stroke: '#888', strokeWidth: 1.8 });

            // Right pillar
            rc.rectangle(525, 65, 55, 205, {
              fill: '#454540', fillStyle: 'cross-hatch', hachureGap: 4.5, stroke: '#777', strokeWidth: 2.2, roughness: 1.3
            });
            rc.rectangle(515, 60, 75, 14, { fill: '#666', stroke: '#888', strokeWidth: 1.8 });
            rc.rectangle(515, 255, 75, 15, { fill: '#666', stroke: '#888', strokeWidth: 1.8 });

            // Back wall niche with ancient urn
            rc.rectangle(295, 80, 50, 50, { fill: '#151514', stroke: '#444', strokeWidth: 1.8 });
            rc.ellipse(320, 110, 24, 28, { fill: '#665', fillStyle: 'solid', stroke: '#888' });

            // Cold ethereal blue glow radiating from the tomb center
            rc.ellipse(320, 200, 310, 130, {
              fill: '#8899aa', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 7, stroke: 'none'
            });

            // THE CENTRAL RAISED STONE BIER
            // Base plinth of the bier
            rc.polygon([[150, 270], [490, 270], [470, 215], [170, 215]], {
              fill: '#50504a', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#aaa', strokeWidth: 2.4, roughness: 1.3
            });
            // Top carved slab of the bier
            rc.polygon([[140, 215], [500, 215], [480, 195], [160, 195]], {
              fill: '#787870', fillStyle: 'solid', stroke: '#ddd', strokeWidth: 2.4
            });

            // THE ANCIENT WIGHT IN RUSTED MAIL (Lying supine upon the bier)
            // Armored head & helmet (spangenhelm / nasal helm) on stone pillow
            rc.polygon([[180, 190], [215, 175], [225, 190], [195, 200]], {
              fill: '#888', fillStyle: 'solid', stroke: '#eee', strokeWidth: 1.8
            });
            // Armored torso in rusted mail
            rc.polygon([[215, 185], [330, 185], [325, 205], [210, 205]], {
              fill: '#555', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#ccc', strokeWidth: 2
            });
            // Armored greaves / legs
            rc.polygon([[330, 190], [410, 190], [405, 205], [325, 205]], {
              fill: '#666', fillStyle: 'solid', stroke: '#bbb', strokeWidth: 1.8
            });
            // Rusted broadsword laid over the warrior's body
            rc.line(220, 193, 390, 193, { stroke: '#eee', strokeWidth: 2.8 }); // Blade
            rc.rectangle(235, 186, 6, 16, { fill: '#aaa', stroke: '#fff', strokeWidth: 1.5 }); // Crossguard
            rc.circle(220, 193, 4, { fill: '#aaa', stroke: '#fff' }); // Pommel

            // SLEEPING GIRL (Elspeth) AT THE FOOT OF THE BIER
            // Nest of woven grave-cloths and shrouds
            rc.ellipse(435, 200, 75, 30, {
              fill: '#c4c4ba', fillStyle: 'cross-hatch', hachureGap: 3.5, stroke: '#eee', strokeWidth: 1.8
            });
            // Sleeping figure wrapped in cloth
            rc.ellipse(430, 195, 45, 18, { fill: '#deded5', fillStyle: 'solid', stroke: '#333', strokeWidth: 1.4 });
            // Peaceful sleeping face & hair
            rc.circle(412, 193, 7, { fill: '#f5e8d8', fillStyle: 'solid', stroke: '#444' });
            rc.curve([[408, 190], [412, 186], [418, 190]], { stroke: '#553311', strokeWidth: 1.8 }); // Hair

            // Spectral mist swirling low near floor
            rc.curve([[120, 275], [250, 255], [390, 270], [510, 255]], { stroke: '#778899', strokeWidth: 2, roughness: 2 });
            rc.curve([[160, 290], [300, 275], [440, 285]], { stroke: '#8899aa', strokeWidth: 1.8, roughness: 2 });
          }
        };

        window.drawLocation = function(id) {
          clear();
          if (locations[id]) {
            locations[id]();
          }
        };
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForTimeout(600);

  const locationIds = [
    'loc-ashford',
    'loc-forest-edge',
    'loc-hunters-camp',
    'loc-wolf-hollow',
    'loc-ruined-chapel',
    'loc-barrow-mound',
    'loc-barrow-tomb'
  ];

  for (const id of locationIds) {
    await page.evaluate((locId) => {
      window.drawLocation(locId);
    }, id);
    await page.waitForTimeout(100);
    const dest = path.join(outputDir, `${id}.png`);
    await page.screenshot({ path: dest });
    console.log(`Generated: ${dest}`);
  }

  await browser.close();
  console.log('All 7 location illustrations generated successfully!');
}

generateLocations().catch((err) => {
  console.error(err);
  process.exit(1);
});
