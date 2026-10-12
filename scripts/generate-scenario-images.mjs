/* eslint-disable */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../scenarios/whispering-woods/images');

fs.mkdirSync(outputDir, { recursive: true });

async function generateAll() {
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

        function rain() {
          for (let i = 0; i < 50; i++) {
            const rx = 25 + (i * 17) % 585;
            const ry = 22 + (i * 23) % 210;
            rc.line(rx, ry, rx - 7, ry + 20, { stroke: '#999', strokeWidth: 1, roughness: 1.8 });
          }
        }

        function drawFernClump(fx, fy) {
          for (let i = -2; i <= 2; i++) {
            rc.curve([[fx, fy], [fx + i * 12, fy - 25], [fx + i * 20, fy - 40]], { stroke: '#222', strokeWidth: 1.6, roughness: 1.4 });
            rc.line(fx + i * 8, fy - 15, fx + i * 16, fy - 22, { stroke: '#444', strokeWidth: 1.2 });
            rc.line(fx + i * 12, fy - 25, fx + i * 22, fy - 30, { stroke: '#444', strokeWidth: 1.2 });
          }
        }

        window.drawScene = function(id) {
          clear();
          if (scenes[id]) {
            scenes[id]();
          }
        };

        const scenes = {
          // 1. arrival: The Bell of Ashford
          'arrival': function() {
            rain();
            // Ground
            rc.curve([[20, 285], [180, 275], [380, 290], [620, 280]], { stroke: '#222', strokeWidth: 2, roughness: 1.5 });
            rc.polygon([[20, 285], [180, 275], [380, 290], [620, 280], [620, 342], [20, 342]], {
              fill: '#d8d8d2', fillStyle: 'hachure', hachureAngle: -20, hachureGap: 8, stroke: 'none'
            });

            // Cottages left background
            rc.rectangle(40, 205, 110, 80, { fill: '#b5b5b0', fillStyle: 'cross-hatch', hachureGap: 7, stroke: '#222', strokeWidth: 1.8, roughness: 1.4 });
            rc.polygon([[30, 205], [95, 150], [160, 205]], { fill: '#777', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 5, stroke: '#111', strokeWidth: 2, roughness: 1.5 });
            rc.rectangle(75, 235, 30, 50, { fill: '#444', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });
            rc.line(40, 235, 150, 235, { stroke: '#333', strokeWidth: 1.5 });

            // Bell tower center-left
            rc.line(220, 285, 240, 90, { stroke: '#1a1a1a', strokeWidth: 3.2, roughness: 1.3 });
            rc.line(300, 285, 280, 90, { stroke: '#1a1a1a', strokeWidth: 3.2, roughness: 1.3 });
            rc.line(235, 285, 248, 90, { stroke: '#444', strokeWidth: 1.6, roughness: 1.3 });
            rc.line(285, 285, 272, 90, { stroke: '#444', strokeWidth: 1.6, roughness: 1.3 });
            // Braces
            rc.line(227, 255, 293, 205, { stroke: '#222', strokeWidth: 2, roughness: 1.4 });
            rc.line(227, 205, 293, 255, { stroke: '#222', strokeWidth: 2, roughness: 1.4 });
            rc.line(234, 185, 286, 135, { stroke: '#222', strokeWidth: 2, roughness: 1.4 });
            rc.line(234, 135, 286, 185, { stroke: '#222', strokeWidth: 2, roughness: 1.4 });
            rc.line(232, 195, 288, 195, { stroke: '#111', strokeWidth: 2.2, roughness: 1.2 });
            rc.line(238, 130, 282, 130, { stroke: '#111', strokeWidth: 2.2, roughness: 1.2 });
            // Belfry roof
            rc.polygon([[225, 90], [260, 45], [295, 90]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.2, roughness: 1.5 });
            // Bronze bell
            rc.arc(260, 112, 30, 32, Math.PI, 0, true, { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.rectangle(246, 112, 28, 6, { fill: '#222', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });
            // Clapper and rope swinging
            rc.circle(260, 120, 6, { fill: '#111', fillStyle: 'solid' });
            rc.curve([[260, 118], [275, 175], [255, 235], [270, 280]], { stroke: '#111', strokeWidth: 2, roughness: 1.6 });

            // Cottages right background
            rc.rectangle(480, 215, 120, 70, { fill: '#b5b5b0', fillStyle: 'cross-hatch', hachureGap: 7, stroke: '#222', strokeWidth: 1.8, roughness: 1.4 });
            rc.polygon([[470, 215], [540, 160], [610, 215]], { fill: '#777', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 5, stroke: '#111', strokeWidth: 2, roughness: 1.5 });

            // Brenna hurrying forward
            rc.circle(410, 195, 24, { fill: '#777', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.ellipse(408, 197, 14, 16, { fill: '#f3f2ee', fillStyle: 'solid', stroke: '#222', strokeWidth: 1.2 });
            rc.polygon([[390, 210], [430, 210], [440, 260], [380, 260]], { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.2 });
            rc.polygon([[392, 260], [428, 260], [435, 310], [385, 310]], { fill: '#ccc', fillStyle: 'hachure', hachureAngle: 85, hachureGap: 4, stroke: '#111', strokeWidth: 2 });
            rc.line(398, 310, 385, 335, { stroke: '#111', strokeWidth: 2.8 });
            rc.line(385, 335, 375, 337, { stroke: '#111', strokeWidth: 3 });
            rc.line(422, 310, 438, 330, { stroke: '#111', strokeWidth: 2.8 });
            rc.line(438, 330, 448, 333, { stroke: '#111', strokeWidth: 3 });

            tuft(50, 315);
            tuft(160, 325);
            tuft(480, 330);
          },

          // 2. elder-plea: Brenna's Plea
          'elder-plea': function() {
            rain();
            // Half-timbered cottage wall background
            rc.rectangle(20, 20, 600, 320, { fill: '#dcdcd6', fillStyle: 'hachure', hachureAngle: 0, hachureGap: 14, stroke: 'none' });
            rc.line(20, 80, 620, 80, { stroke: '#333', strokeWidth: 3, roughness: 1.3 });
            rc.line(20, 175, 620, 175, { stroke: '#333', strokeWidth: 3, roughness: 1.3 });
            rc.line(150, 20, 150, 340, { stroke: '#333', strokeWidth: 3, roughness: 1.3 });
            rc.line(490, 20, 490, 340, { stroke: '#333', strokeWidth: 3, roughness: 1.3 });

            // Open wooden cottage door in background
            rc.rectangle(265, 75, 120, 245, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.5, roughness: 1.4 });

            // Elder Brenna figure in center foreground
            rc.circle(325, 135, 52, { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.2, roughness: 1.3 });
            rc.ellipse(325, 140, 32, 36, { fill: '#f3f2ee', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.6 });
            // Wrinkles and somber eyes
            rc.arc(316, 135, 8, 4, Math.PI, 0, false, { stroke: '#222', strokeWidth: 1.5 });
            rc.arc(334, 135, 8, 4, Math.PI, 0, false, { stroke: '#222', strokeWidth: 1.5 });
            rc.line(325, 138, 323, 148, { stroke: '#222', strokeWidth: 1.5 });
            rc.arc(325, 156, 14, 6, Math.PI, 0, false, { stroke: '#222', strokeWidth: 1.5 });

            // Torso & shawl
            rc.polygon([[260, 175], [390, 175], [415, 330], [235, 330]], { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.4, roughness: 1.4 });
            rc.polygon([[275, 230], [375, 230], [390, 330], [260, 330]], { fill: '#e0e0db', fillStyle: 'hachure', hachureAngle: 90, hachureGap: 5, stroke: '#111', strokeWidth: 1.8 });

            // Arms offering herbs forward
            rc.curve([[265, 195], [290, 245], [315, 255]], { stroke: '#111', strokeWidth: 3 });
            rc.curve([[385, 195], [360, 245], [335, 255]], { stroke: '#111', strokeWidth: 3 });

            // Tied bundle of wild healing herbs
            rc.circle(325, 255, 12, { stroke: '#111', strokeWidth: 2 });
            rc.line(325, 255, 325, 295, { stroke: '#1a1a1a', strokeWidth: 2.4 });
            rc.line(325, 255, 315, 290, { stroke: '#1a1a1a', strokeWidth: 2.2 });
            rc.line(325, 255, 335, 290, { stroke: '#1a1a1a', strokeWidth: 2.2 });
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
              const lx = 325 + Math.cos(a) * 24;
              const ly = 230 + Math.sin(a) * 18;
              rc.ellipse(lx, ly, 18, 9, { fill: '#555', fillStyle: 'hachure', hachureGap: 3, stroke: '#111', strokeWidth: 1.4 });
            }
          },

          // 3. village-return: Watched from a Doorway
          'village-return': function() {
            rain();
            // Cottage facade taking up right 60% of frame
            rc.rectangle(230, 25, 390, 310, { fill: '#d2d2cc', fillStyle: 'cross-hatch', hachureGap: 9, stroke: '#222', strokeWidth: 2.2, roughness: 1.4 });
            rc.polygon([[210, 25], [420, 0], [620, 25], [620, 55], [210, 55]], { fill: '#777', fillStyle: 'hachure', hachureAngle: 60, hachureGap: 4, stroke: '#111', strokeWidth: 2 });

            // Heavy timber doorframe & open door
            rc.rectangle(285, 55, 165, 275, { fill: '#1a1a1a', fillStyle: 'solid', stroke: '#111', strokeWidth: 3 });

            // Brenna silhouetted inside dark doorway
            rc.circle(368, 120, 40, { fill: '#555', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.polygon([[335, 145], [400, 145], [410, 325], [325, 325]], { fill: '#3a3a3a', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 2.2 });

            // Cottage window right of door
            rc.rectangle(485, 110, 80, 90, { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2 });
            rc.line(525, 110, 525, 200, { stroke: '#111', strokeWidth: 2 });
            rc.line(485, 155, 565, 155, { stroke: '#111', strokeWidth: 2 });

            // Left side: Misty village green
            rc.curve([[20, 265], [130, 275], [230, 290]], { stroke: '#222', strokeWidth: 2 });
            rc.curve([[20, 325], [120, 320], [230, 325]], { stroke: '#444', strokeWidth: 1.8 });
            rc.circle(80, 175, 55, { fill: '#bbb', fillStyle: 'hachure', hachureGap: 6, stroke: '#777', strokeWidth: 1.5, roughness: 2 });
            rc.circle(150, 185, 45, { fill: '#ccc', fillStyle: 'hachure', hachureGap: 7, stroke: '#888', strokeWidth: 1.5, roughness: 2 });

            tuft(60, 305);
            tuft(140, 320);
          },

          // 4. well-rumours: Gossip at the Well
          'well-rumours': function() {
            rain();
            // Ground
            rc.curve([[20, 275], [200, 265], [450, 280], [620, 275]], { stroke: '#222', strokeWidth: 2 });
            rc.polygon([[20, 275], [200, 265], [450, 280], [620, 275], [620, 342], [20, 342]], { fill: '#dcdcd8', fillStyle: 'hachure', hachureAngle: -20, hachureGap: 8, stroke: 'none' });

            // Gnarled tree behind well
            rc.polygon([[120, 270], [135, 140], [155, 140], [170, 270]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2 });
            rc.circle(145, 95, 75, { fill: '#555', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 5, stroke: '#111', strokeWidth: 1.8, roughness: 2 });

            // Central Stone Water Well
            rc.rectangle(250, 205, 140, 85, { fill: '#888', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.4, roughness: 1.4 });
            // Masonry lines on well
            rc.line(250, 230, 390, 230, { stroke: '#333', strokeWidth: 1.5 });
            rc.line(250, 255, 390, 255, { stroke: '#333', strokeWidth: 1.5 });
            rc.line(310, 205, 310, 230, { stroke: '#333', strokeWidth: 1.5 });
            rc.line(280, 230, 280, 255, { stroke: '#333', strokeWidth: 1.5 });
            rc.line(350, 230, 350, 255, { stroke: '#333', strokeWidth: 1.5 });
            rc.ellipse(320, 205, 140, 38, { fill: '#666', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2 });
            rc.ellipse(320, 205, 110, 26, { fill: '#1a1a1a', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });

            // Well timber roof posts
            rc.line(265, 205, 265, 95, { stroke: '#111', strokeWidth: 3.5, roughness: 1.2 });
            rc.line(375, 205, 375, 95, { stroke: '#111', strokeWidth: 3.5, roughness: 1.2 });
            // Windlass, rope & wooden bucket
            rc.line(265, 130, 375, 130, { stroke: '#333', strokeWidth: 3 });
            rc.line(375, 130, 395, 130, { stroke: '#111', strokeWidth: 2.2 });
            rc.line(395, 130, 395, 145, { stroke: '#111', strokeWidth: 2.2 });
            rc.line(320, 130, 320, 175, { stroke: '#111', strokeWidth: 2 });
            rc.polygon([[310, 175], [330, 175], [327, 195], [313, 195]], { fill: '#444', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });
            // Roof
            rc.polygon([[240, 100], [320, 45], [400, 100]], { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.5, roughness: 1.5 });

            // Old Man 1 (Left, leaning on staff)
            rc.circle(195, 170, 28, { fill: '#777', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.polygon([[180, 185], [220, 195], [225, 290], [170, 290]], { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.2 });
            rc.line(155, 160, 145, 295, { stroke: '#111', strokeWidth: 3.2, roughness: 1.2 });
            rc.line(205, 200, 255, 210, { stroke: '#111', strokeWidth: 2.5 });

            // Old Man 2 (Right, leaning on well)
            rc.circle(445, 175, 28, { fill: '#666', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.polygon([[425, 195], [465, 185], [475, 290], [420, 290]], { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.2 });
            rc.line(435, 200, 385, 210, { stroke: '#111', strokeWidth: 2.5 });

            tuft(100, 310);
            tuft(490, 315);
          },

          // 5. whispers: The Whispering Trees
          'whispers': function() {
            // Ground
            rc.curve([[20, 295], [180, 275], [350, 290], [620, 285]], { stroke: '#111', strokeWidth: 2.2 });
            rc.polygon([[20, 295], [180, 275], [350, 290], [620, 285], [620, 342], [20, 342]], { fill: '#b5b5b0', fillStyle: 'cross-hatch', hachureGap: 7, stroke: 'none' });

            // Left Great Gnarled Oak
            rc.polygon([[60, 340], [85, 250], [90, 140], [125, 250], [165, 340]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.4, roughness: 1.6 });
            rc.curve([[85, 285], [50, 315], [30, 335]], { stroke: '#111', strokeWidth: 2.5 });
            rc.curve([[130, 285], [175, 320], [195, 335]], { stroke: '#111', strokeWidth: 2.5 });
            rc.circle(100, 95, 120, { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2, roughness: 2.2 });

            // Right Gnarled Oak
            rc.polygon([[465, 340], [485, 240], [510, 130], [535, 240], [585, 340]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.4, roughness: 1.6 });
            rc.curve([[530, 275], [565, 310], [605, 330]], { stroke: '#111', strokeWidth: 2.5 });
            rc.circle(520, 85, 130, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2, roughness: 2.2 });

            // Shadowy forest path into the deep woods
            rc.polygon([[240, 342], [290, 265], [320, 265], [370, 342]], { fill: '#999', fillStyle: 'hachure', hachureAngle: 60, hachureGap: 6, stroke: '#333', strokeWidth: 1.5 });

            // Swirling wind vortex lines
            rc.curve([[140, 200], [250, 160], [350, 200], [450, 170]], { stroke: '#555', strokeWidth: 2, roughness: 1.8 });
            rc.curve([[180, 230], [280, 190], [380, 230]], { stroke: '#666', strokeWidth: 1.8, roughness: 1.8 });
            rc.curve([[220, 150], [310, 120], [400, 150]], { stroke: '#777', strokeWidth: 1.5, roughness: 1.8 });

            // Swirling oak leaves
            const leaves = [[230, 170], [270, 150], [310, 185], [340, 140], [370, 175], [410, 155], [290, 215]];
            for (const [lx, ly] of leaves) {
              rc.ellipse(lx, ly, 16, 7, { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.2 });
            }

            tuft(190, 315);
            tuft(420, 320);
          },

          // 6. camp-standoff: An Arrow at the Ready
          'camp-standoff': function() {
            // Pine forest ground
            rc.curve([[20, 285], [250, 275], [620, 285]], { stroke: '#111', strokeWidth: 2.2 });
            rc.polygon([[20, 285], [250, 275], [620, 285], [620, 342], [20, 342]], { fill: '#dcdcd8', fillStyle: 'hachure', hachureAngle: -20, hachureGap: 8, stroke: 'none' });

            // Hunter's Lean-to shelter on the left
            rc.line(70, 280, 170, 125, { stroke: '#111', strokeWidth: 4, roughness: 1.3 });
            rc.line(210, 280, 260, 125, { stroke: '#111', strokeWidth: 4, roughness: 1.3 });
            rc.line(160, 125, 270, 125, { stroke: '#111', strokeWidth: 3.5, roughness: 1.3 });
            rc.polygon([[60, 280], [160, 120], [270, 120], [200, 280]], { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2 });

            // Hunter in torn coat aiming bow center-right
            rc.circle(380, 155, 28, { fill: '#555', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2 });
            rc.arc(372, 157, 8, 4, Math.PI, 0, false, { stroke: '#111', strokeWidth: 1.8 });
            // Tattered army coat torso
            rc.polygon([[355, 170], [410, 170], [425, 280], [345, 280]], { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.4 });
            // Legs in stance
            rc.line(365, 280, 345, 325, { stroke: '#111', strokeWidth: 3 });
            rc.line(405, 280, 430, 325, { stroke: '#111', strokeWidth: 3 });

            // Drawn Hunting Bow
            rc.arc(305, 190, 32, 130, -Math.PI / 2, Math.PI / 2, false, { stroke: '#111', strokeWidth: 3.5, roughness: 1.3 });
            rc.line(305, 125, 375, 190, { stroke: '#222', strokeWidth: 1.6 });
            rc.line(305, 255, 375, 190, { stroke: '#222', strokeWidth: 1.6 });
            rc.line(380, 190, 250, 190, { stroke: '#111', strokeWidth: 2.5 });
            rc.polygon([[250, 190], [264, 184], [264, 196]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });

            // Pine trees right background
            rc.polygon([[490, 280], [520, 60], [550, 280]], { fill: '#666', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 5, stroke: '#222', strokeWidth: 2 });
            rc.polygon([[540, 280], [570, 80], [600, 280]], { fill: '#777', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 5, stroke: '#222', strokeWidth: 2 });

            tuft(110, 315);
            tuft(460, 315);
          },

          // 7. search-camp: Search the Camp
          'search-camp': function() {
            // Interior wooden lean-to framing
            rc.line(40, 20, 40, 340, { stroke: '#222', strokeWidth: 4, roughness: 1.3 });
            rc.line(600, 20, 600, 340, { stroke: '#222', strokeWidth: 4, roughness: 1.3 });
            rc.line(30, 55, 610, 55, { stroke: '#222', strokeWidth: 4, roughness: 1.3 });
            for (let rx = 75; rx < 600; rx += 65) {
              rc.line(rx, 55, rx - 30, 20, { stroke: '#444', strokeWidth: 2.5 });
            }

            // Split-log camp bench / platform
            rc.rectangle(90, 200, 460, 75, { fill: '#888', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#111', strokeWidth: 2.5, roughness: 1.4 });
            rc.line(130, 275, 130, 335, { stroke: '#111', strokeWidth: 4 });
            rc.line(510, 275, 510, 335, { stroke: '#111', strokeWidth: 4 });

            // Oilcloth tarp spread on the log
            rc.polygon([[130, 210], [490, 205], [510, 255], [110, 260]], { fill: '#c0c0b8', fillStyle: 'hachure', hachureAngle: 15, hachureGap: 5, stroke: '#111', strokeWidth: 1.8 });

            // Woodsman's Axe on oilcloth
            rc.line(150, 245, 370, 220, { stroke: '#2b2b2b', strokeWidth: 5, roughness: 1.2 });
            rc.polygon([[360, 205], [415, 195], [425, 235], [365, 235]], { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2, roughness: 1.3 });
            rc.curve([[415, 195], [430, 215], [425, 235]], { stroke: '#eee', strokeWidth: 1.8 });

            // Tied pouches of dried herbs
            rc.circle(440, 235, 20, { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 2 });
            rc.circle(475, 238, 16, { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 1.8 });
            rc.line(440, 225, 435, 215, { stroke: '#111', strokeWidth: 1.5 });
            rc.line(440, 225, 448, 215, { stroke: '#111', strokeWidth: 1.5 });

            // Stone fire ring on the ground to left
            rc.ellipse(100, 310, 65, 22, { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2 });
            rc.ellipse(100, 310, 35, 12, { fill: '#222', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });
          },

          // 8. wolf-den: Eyes in the Ferns
          'wolf-den': function() {
            // Hollow banks
            rc.curve([[20, 255], [180, 280], [400, 275], [620, 245]], { stroke: '#111', strokeWidth: 2.2 });
            rc.polygon([[20, 255], [180, 280], [400, 275], [620, 245], [620, 342], [20, 342]], { fill: '#b0b0a8', fillStyle: 'cross-hatch', hachureGap: 6, stroke: 'none' });

            // Forest background trees
            rc.polygon([[40, 255], [65, 50], [95, 255]], { fill: '#666', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 6, stroke: '#222', strokeWidth: 2 });
            rc.polygon([[540, 245], [570, 50], [600, 245]], { fill: '#666', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 6, stroke: '#222', strokeWidth: 2 });

            // Mossy fallen beech tree trunk across the hollow
            rc.polygon([[40, 235], [590, 220], [600, 275], [30, 290]], { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 4.5, stroke: '#111', strokeWidth: 2.6, roughness: 1.4 });
            rc.line(130, 235, 110, 175, { stroke: '#111', strokeWidth: 3 });
            rc.line(490, 220, 515, 170, { stroke: '#111', strokeWidth: 3 });

            // Large wild wolf crouching behind the log
            // Body arch behind trunk
            rc.ellipse(320, 195, 130, 55, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 3.5, stroke: '#111', strokeWidth: 2.2 });
            // Wolf neck & chest ruff
            rc.polygon([[260, 190], [285, 140], [335, 155], [315, 205]], { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            // Wolf head
            rc.polygon([[240, 160], [285, 120], [320, 145], [290, 185], [245, 175]], { fill: '#222', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2 });
            // Pointed ears
            rc.polygon([[275, 125], [282, 85], [298, 118]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.6 });
            rc.polygon([[305, 130], [318, 92], [328, 132]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.6 });
            // Alert glowing eyes
            rc.ellipse(262, 150, 8, 5, { fill: '#fff', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.2 });
            rc.ellipse(288, 152, 8, 5, { fill: '#fff', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.2 });
            rc.circle(262, 150, 2.5, { fill: '#000', fillStyle: 'solid' });
            rc.circle(288, 152, 2.5, { fill: '#000', fillStyle: 'solid' });
            // Snout / muzzle
            rc.polygon([[230, 165], [250, 155], [250, 172]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });

            // Lush ferns in foreground & around log
            drawFernClump(90, 315);
            drawFernClump(200, 325);
            drawFernClump(320, 330);
            drawFernClump(440, 325);
            drawFernClump(550, 315);
          },

          // 9. wolf-again: Deal with the Wolf
          'wolf-again': function() {
            // Ground
            rc.curve([[20, 275], [300, 285], [620, 270]], { stroke: '#111', strokeWidth: 2.2 });
            rc.polygon([[20, 275], [300, 285], [620, 270], [620, 342], [20, 342]], { fill: '#b0b0a8', fillStyle: 'cross-hatch', hachureGap: 6, stroke: 'none' });

            // Dark ominous forest trees
            rc.polygon([[40, 275], [70, 40], [110, 275]], { fill: '#555', fillStyle: 'hachure', hachureAngle: 60, hachureGap: 5, stroke: '#222', strokeWidth: 2 });
            rc.polygon([[530, 270], [560, 50], [600, 270]], { fill: '#555', fillStyle: 'hachure', hachureAngle: -60, hachureGap: 5, stroke: '#222', strokeWidth: 2 });

            // Snarling wolf crouching forward
            rc.ellipse(360, 225, 170, 65, { fill: '#3a3a3a', fillStyle: 'cross-hatch', hachureGap: 3.5, stroke: '#111', strokeWidth: 2.5, roughness: 1.4 });
            // Bristling fur on spine
            for (let x = 300; x < 440; x += 10) {
              rc.line(x, 195, x - 5, 178, { stroke: '#111', strokeWidth: 2.2 });
            }
            // Tail raised tense
            rc.curve([[445, 225], [485, 205], [515, 230]], { stroke: '#111', strokeWidth: 3.5 });

            // Snarling head facing forward
            rc.circle(260, 185, 46, { fill: '#2a2a2a', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.5 });
            // Pointed wolf ears
            rc.polygon([[240, 160], [230, 115], [258, 150]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.8 });
            rc.polygon([[275, 160], [292, 120], [288, 155]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.8 });
            // Fierce eyes
            rc.ellipse(242, 175, 10, 6, { fill: '#fff', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.5 });
            rc.ellipse(275, 175, 10, 6, { fill: '#fff', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.5 });
            rc.circle(242, 175, 3, { fill: '#000', fillStyle: 'solid' });
            rc.circle(275, 175, 3, { fill: '#000', fillStyle: 'solid' });
            // Snout and open snarling jaws
            rc.polygon([[230, 195], [285, 195], [260, 235]], { fill: '#111', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            // Bared fangs
            rc.polygon([[242, 195], [247, 212], [252, 195]], { fill: '#fff', fillStyle: 'solid', stroke: '#111', strokeWidth: 1 });
            rc.polygon([[262, 195], [267, 212], [272, 195]], { fill: '#fff', fillStyle: 'solid', stroke: '#111', strokeWidth: 1 });

            // Stalking legs & claws
            rc.line(280, 245, 270, 310, { stroke: '#111', strokeWidth: 3.5 });
            rc.line(320, 245, 315, 315, { stroke: '#111', strokeWidth: 3.5 });
            rc.line(400, 245, 410, 310, { stroke: '#111', strokeWidth: 3.5 });

            drawFernClump(80, 315);
            drawFernClump(500, 320);
          },

          // 10. chapel-threshold: The Sunken Floor
          'chapel-threshold': function() {
            // Ruined gothic stone chapel background
            // Pointed arch window frame
            rc.arc(320, 110, 150, 170, Math.PI, 0, false, { stroke: '#111', strokeWidth: 3.5, roughness: 1.5 });
            rc.line(245, 110, 245, 195, { stroke: '#111', strokeWidth: 3.5 });
            rc.line(395, 110, 395, 195, { stroke: '#111', strokeWidth: 3.5 });
            // Stone walls with masonry joints
            rc.rectangle(20, 20, 90, 260, { fill: '#888', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 8, stroke: '#111', strokeWidth: 2 });
            rc.rectangle(530, 20, 90, 260, { fill: '#888', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 8, stroke: '#111', strokeWidth: 2 });
            // Ivy on ruined arch
            for (let y = 45; y < 190; y += 18) {
              rc.circle(240 + (y % 10), y, 10, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 1.2 });
              rc.circle(400 - (y % 10), y, 10, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 1.2 });
            }

            // Distant altar steps at far end
            rc.polygon([[250, 195], [390, 195], [410, 215], [230, 215]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2 });

            // Foreground entrance threshold
            rc.polygon([[20, 295], [170, 265], [210, 342], [20, 342]], { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2 });

            // Dark sunken crypt chasm (Center abyss)
            rc.polygon([[170, 265], [250, 195], [390, 195], [470, 265], [620, 342], [210, 342]], {
              fill: '#1a1a1a', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.5
            });

            // Tilted, broken, precariously balanced flagstones across the chasm
            rc.polygon([[180, 275], [245, 250], [260, 270], [195, 295]], { fill: '#999', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#fff', strokeWidth: 2, roughness: 1.3 });
            rc.polygon([[275, 245], [340, 235], [350, 255], [285, 265]], { fill: '#aaa', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#fff', strokeWidth: 2, roughness: 1.3 });
            rc.polygon([[355, 225], [415, 215], [425, 235], [365, 245]], { fill: '#999', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#fff', strokeWidth: 2, roughness: 1.3 });

            // Jagged crumbling crypt edge stones
            rc.line(170, 265, 200, 305, { stroke: '#fff', strokeWidth: 2 });
            rc.line(470, 265, 440, 305, { stroke: '#fff', strokeWidth: 2 });
          },

          // 11. chapel-altar: The Altar
          'chapel-altar': function() {
            // Ruined gothic arch window frame in background
            rc.arc(320, 95, 200, 210, Math.PI, 0, false, { stroke: '#111', strokeWidth: 3.5, roughness: 1.4 });
            rc.line(220, 95, 220, 175, { stroke: '#111', strokeWidth: 3.5 });
            rc.line(420, 95, 420, 175, { stroke: '#111', strokeWidth: 3.5 });
            // Broken arch stonework
            rc.arc(320, 95, 240, 240, Math.PI, 0, false, { stroke: '#333', strokeWidth: 1.8, roughness: 1.4 });

            // Side stone pillars
            rc.rectangle(20, 20, 80, 320, { fill: '#888', fillStyle: 'hachure', hachureAngle: 45, hachureGap: 8, stroke: '#111', strokeWidth: 2.2 });
            rc.rectangle(540, 20, 80, 320, { fill: '#888', fillStyle: 'hachure', hachureAngle: -45, hachureGap: 8, stroke: '#111', strokeWidth: 2.2 });
            for (let y = 60; y < 320; y += 40) {
              rc.line(20, y, 100, y, { stroke: '#222', strokeWidth: 1.5 });
              rc.line(540, y, 620, y, { stroke: '#222', strokeWidth: 1.5 });
            }

            // Hanging ivy tendrils
            for (let y = 30; y < 220; y += 20) {
              rc.circle(105, y, 14, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 1.4 });
              rc.circle(535, y + 10, 14, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 1.4 });
            }

            // Altar stone steps
            rc.rectangle(170, 265, 300, 25, { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2 });
            rc.rectangle(195, 240, 250, 25, { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2 });

            // Massive cracked stone altar block
            rc.rectangle(210, 155, 220, 85, { fill: '#888', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.5, roughness: 1.4 });
            // Deep diagonal crack across altar
            rc.curve([[245, 155], [275, 195], [285, 240]], { stroke: '#111', strokeWidth: 2.5, roughness: 1.8 });

            // Dramatic shaft of sunlight coming from top right
            rc.polygon([[510, 20], [580, 20], [365, 155], [275, 155]], {
              fill: '#ffffff', fillStyle: 'hachure', hachureAngle: -55, hachureGap: 3, stroke: 'none', opacity: 0.85
            });

            // The Silver Disc (talisman) resting on the altar in the light
            rc.ellipse(320, 155, 26, 15, { fill: '#ffffff', fillStyle: 'solid', stroke: '#111', strokeWidth: 2.2 });
            // Engraved hawk symbol
            rc.curve([[312, 155], [320, 150], [328, 155]], { stroke: '#111', strokeWidth: 2 });
            // Chain trailing off the altar
            rc.curve([[320, 160], [332, 180], [326, 205]], { stroke: '#333', strokeWidth: 1.8, roughness: 1.5 });
          },

          // 12. chapel-prayer: Kneel at the Altar
          'chapel-prayer': function() {
            rain();
            // Ruined stone arch framing the chapel
            rc.arc(320, 130, 240, 240, Math.PI, 0, false, { stroke: '#111', strokeWidth: 3.5, roughness: 1.4 });
            rc.line(200, 130, 200, 310, { stroke: '#111', strokeWidth: 3.5 });
            rc.line(440, 130, 440, 310, { stroke: '#111', strokeWidth: 3.5 });
            for (let i = 0; i < 12; i++) {
              const ix = 200 + i * 20;
              const iy = 40 + (i % 3) * 15;
              rc.circle(ix, iy, 12, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 3, stroke: '#111', strokeWidth: 1.2 });
            }

            // Altar on the right
            rc.rectangle(370, 195, 130, 110, { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.2 });

            // Adventurer kneeling in prayer before altar on the left
            rc.circle(270, 195, 26, { fill: '#555', fillStyle: 'solid', stroke: '#111', strokeWidth: 2 });
            rc.polygon([[250, 210], [290, 210], [315, 305], [230, 305]], { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 4, stroke: '#111', strokeWidth: 2.4 });
            // Clasped hands raised towards altar
            rc.ellipse(310, 220, 14, 10, { fill: '#e0e0db', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.6 });

            // A small solitary candle on the altar casting soft light
            rc.rectangle(410, 180, 8, 15, { fill: '#eee', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.2 });
            rc.ellipse(414, 175, 6, 10, { fill: '#ffffff', fillStyle: 'solid', stroke: '#222', strokeWidth: 1 });

            rc.line(20, 305, 620, 305, { stroke: '#111', strokeWidth: 2 });
          },

          // 13. barrow-door: The Sealed Door
          'barrow-door': function() {
            // Earthen barrow mound
            rc.curve([[24, 290], [150, 240], [320, 180], [490, 240], [616, 290]], { stroke: '#222', strokeWidth: 2.2, roughness: 1.6 });
            rc.polygon([[24, 340], [24, 290], [150, 240], [320, 180], [490, 240], [616, 290], [616, 340]], {
              fill: '#888', fillStyle: 'hachure', hachureAngle: -25, hachureGap: 8, stroke: 'none', roughness: 1.8
            });

            // Standing stones
            rc.polygon([[140, 245], [148, 175], [165, 170], [172, 240]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#1a1a1a', strokeWidth: 2, roughness: 1.5 });
            rc.polygon([[90, 275], [96, 220], [108, 218], [114, 270]], { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#222', strokeWidth: 1.8, roughness: 1.4 });
            rc.polygon([[470, 242], [478, 165], [498, 160], [505, 238]], { fill: '#666', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#1a1a1a', strokeWidth: 2, roughness: 1.5 });
            rc.polygon([[535, 272], [540, 215], [552, 212], [558, 268]], { fill: '#777', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#222', strokeWidth: 1.8, roughness: 1.4 });

            // Portal Frame
            rc.rectangle(230, 195, 180, 25, { fill: '#555', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.4, roughness: 1.4 });
            rc.rectangle(235, 220, 25, 115, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.2, roughness: 1.4 });
            rc.rectangle(380, 220, 25, 115, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#111', strokeWidth: 2.2, roughness: 1.4 });

            // Sealed Slab Door
            rc.rectangle(260, 220, 120, 115, { fill: '#777', fillStyle: 'hachure', hachureAngle: 65, hachureGap: 5, stroke: '#111', strokeWidth: 2, roughness: 1.3 });

            // Serpent rune bands
            rc.line(265, 245, 375, 245, { stroke: '#222', strokeWidth: 1.5, roughness: 1.2 });
            rc.line(265, 260, 375, 260, { stroke: '#222', strokeWidth: 1.5, roughness: 1.2 });
            for (let x = 275; x < 370; x += 15) {
              rc.line(x, 247, x + 6, 258, { stroke: '#111', strokeWidth: 1.8 });
              rc.line(x + 6, 247, x, 258, { stroke: '#111', strokeWidth: 1.8 });
            }

            // Serpent Keyhole
            rc.circle(320, 280, 22, { stroke: '#111', strokeWidth: 2.2, roughness: 1.6 });
            rc.ellipse(320, 280, 8, 14, { fill: '#111', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.5 });

            rc.rectangle(24, 335, 592, 5, { fill: '#333', fillStyle: 'solid', stroke: '#111', strokeWidth: 1.5 });
            tuft(60, 335);
            tuft(110, 335);
            tuft(190, 335);
            tuft(430, 335);
            tuft(520, 335);
          },

          // 14. wight-awakens: The Wight Awakens
          'wight-awakens': function() {
            // Dark stone crypt chamber background
            rc.rectangle(20, 20, 600, 320, { fill: '#1a1a1a', fillStyle: 'solid', stroke: 'none' });
            for (let y = 30; y < 220; y += 40) {
              rc.line(20, y, 620, y, { stroke: '#333', strokeWidth: 1.8 });
            }
            // Crypt pillars
            rc.rectangle(45, 30, 50, 290, { fill: '#333', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#555', strokeWidth: 2 });
            rc.rectangle(545, 30, 50, 290, { fill: '#333', fillStyle: 'cross-hatch', hachureGap: 6, stroke: '#555', strokeWidth: 2 });

            // Carved Stone Bier / Sarcophagus
            rc.rectangle(150, 225, 340, 85, { fill: '#444', fillStyle: 'cross-hatch', hachureGap: 5, stroke: '#999', strokeWidth: 2.4, roughness: 1.4 });
            // Runic carving band along sarcophagus
            rc.line(160, 240, 480, 240, { stroke: '#777', strokeWidth: 1.5 });
            for (let rx = 175; rx < 470; rx += 25) {
              rc.line(rx, 230, rx + 8, 238, { stroke: '#888', strokeWidth: 1.5 });
            }

            // Undead Wight Warrior (sitting up on bier)
            // Ancient horned helmet
            rc.circle(320, 110, 36, { fill: '#444', fillStyle: 'solid', stroke: '#fff', strokeWidth: 2.2 });
            // Horns
            rc.curve([[305, 100], [275, 75], [265, 55]], { stroke: '#fff', strokeWidth: 3.2 });
            rc.curve([[335, 100], [365, 75], [375, 55]], { stroke: '#fff', strokeWidth: 3.2 });
            // Glowing cold eye slits
            rc.ellipse(310, 110, 10, 6, { fill: '#fff', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.5 });
            rc.ellipse(330, 110, 10, 6, { fill: '#fff', fillStyle: 'solid', stroke: '#000', strokeWidth: 1.5 });
            rc.circle(310, 110, 3, { fill: '#000', fillStyle: 'solid' });
            rc.circle(330, 110, 3, { fill: '#000', fillStyle: 'solid' });

            // Armored skeletal torso sitting up
            rc.polygon([[270, 135], [370, 135], [385, 230], [255, 230]], {
              fill: '#333', fillStyle: 'cross-hatch', hachureGap: 3.5, stroke: '#ddd', strokeWidth: 2.2
            });

            // Drawing the rusted broadsword
            rc.line(355, 155, 415, 170, { stroke: '#ddd', strokeWidth: 3 });
            // Crossguard
            rc.rectangle(410, 155, 10, 32, { fill: '#888', fillStyle: 'solid', stroke: '#fff', strokeWidth: 1.8 });
            // Blade
            rc.polygon([[415, 165], [490, 110], [482, 100], [410, 160]], { fill: '#aaa', fillStyle: 'solid', stroke: '#fff', strokeWidth: 2 });
            rc.line(445, 140, 447, 135, { stroke: '#111', strokeWidth: 2 });
            rc.line(465, 125, 468, 120, { stroke: '#111', strokeWidth: 2 });

            // Spectral mist swirling around bier
            rc.curve([[140, 285], [280, 255], [420, 275], [520, 250]], { stroke: '#666', strokeWidth: 2, roughness: 2 });
            rc.curve([[180, 305], [320, 280], [460, 300]], { stroke: '#555', strokeWidth: 1.8, roughness: 2 });
          }
        };
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForTimeout(600);

  const sceneIds = [
    'arrival',
    'elder-plea',
    'village-return',
    'well-rumours',
    'whispers',
    'camp-standoff',
    'search-camp',
    'wolf-den',
    'wolf-again',
    'chapel-threshold',
    'chapel-altar',
    'chapel-prayer',
    'barrow-door',
    'wight-awakens'
  ];

  for (const id of sceneIds) {
    await page.evaluate((sceneId) => {
      window.drawScene(sceneId);
    }, id);
    await page.waitForTimeout(100);
    const dest = path.join(outputDir, `${id}.png`);
    await page.screenshot({ path: dest });
    console.log(`Generated: ${dest}`);
  }

  await browser.close();
  console.log('All 14 scene illustrations regenerated with enhanced details!');
}

generateAll().catch(err => {
  console.error(err);
  process.exit(1);
});
