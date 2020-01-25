'use strict';
import {search} from './modules/fetch.js';
import {colors} from './modules/colors.js';
import {Point, scale, clip, drunk, fold, Queue, sum} from './modules/algs.js';
import {mapPointHandler, map} from './modules/map.js';
import {OscBank, unlockAudioContext} from './modules/ljud.js';
import {Freeverb} from './freeverb.js';

function createDiv(className, innerHTML) {
  var res = document.createElement("div");
  res.className = className;
  res.innerHTML = innerHTML;
  return res;
}

const bottom = document.getElementById("bottom");

for (let c of colors) { 
  var color = document.createElement('div');
  color.className = c.color;
  bottom.appendChild(color);
  var hr = document.createElement("hr");
  hr.className = "blob";
  color.appendChild(hr);
  color.appendChild(createDiv("level", c.level));
  color.appendChild(createDiv("health", c.health));
  color.appendChild(createDiv("caution", c.caution));
}

function addElementHider(elementToListenTo, elementToShow) {
  elementToListenTo.addEventListener("click", function() {
    elementToShow.style.visibility = (elementToShow.style.visibility === "hidden") ? "visible" : "hidden";
  });
}

addElementHider(document.querySelector("#info"), bottom)
addElementHider(document.querySelector("#bottom #exit"), bottom);
addElementHider(document.querySelector("#credits"), creditDiv)
addElementHider(document.querySelector("#exit"), creditDiv);



const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
unlockAudioContext(audioCtx);

var reverb  = Freeverb(audioCtx);
reverb.roomSize = 0.8
reverb.dampening = 10000
reverb.wet.value = 0.5
reverb.dry.value = 1.
reverb.connect(audioCtx.destination);

const nb_oscs = 6,
    notes = [196.0, 246.9, 293.7, 493.9, 523.3, 659.3],
    oscs = new Array(nb_oscs),
    frequencies = new Array(nb_oscs),
    pannerNodes = new Array(nb_oscs),
    gainNodes = new Array(nb_oscs);
var vol = 0.5/nb_oscs;

for (let i = 0; i < nb_oscs; i++) {

  gainNodes[i] = audioCtx.createGain();
  gainNodes[i].connect(reverb);
  gainNodes[i].gain.value = 0;

  pannerNodes[i] = audioCtx.createPanner();
  pannerNodes[i].connect(gainNodes[i]);
  pannerNodes[i].setPosition(0,0,0.5);

  var s = Math.floor(Math.random()*notes.length);
  frequencies[i] = notes[s]/2;

  oscs[i] = new OscBank(audioCtx, frequencies[i], [1,2,3,5,7], 1200);
  oscs[i].connect(pannerNodes[i]);
  oscs[i].start();
}

var timerID;
var c = 0;
let play = true;
let lookahead = 1000;
let decay = 0;
var intensity = 125;
var noteQueue = new Queue(6);
noteQueue.enqueue(0);
noteQueue.enqueue(1);
noteQueue.enqueue(2);
noteQueue.enqueue(3);
noteQueue.enqueue(4);
noteQueue.enqueue(5);

notescheduler();

function notescheduler() {
  var n = noteQueue.dequeue();
  c = fold(drunk(c, 5),0,4);
  //lookahead = 100.0+c*50.0;
  lookahead = intensity*Math.pow(2,c);
  var s = Math.round(Math.random()*(nb_oscs-1));
  var okt = Math.round(Math.random()*3)+1;
  oscs[n].linearRampToFrequencyAtTime(okt*notes[s]/4, 0.01);
  oscs[n].env(1., 0.05, 2.0);
  noteQueue.enqueue(n);
    timerID = window.setTimeout(notescheduler, lookahead);
}


var mapPointsMap = new Map();
var mapPoints = new Array();

function fetchHandler(response) {
  var newPts = new Array();
  var res= JSON.parse(response).data;
  res.forEach( (p,i) => {
      var aqi = parseFloat(p.aqi);
      if (!Number.isNaN(aqi)) {
        if (!mapPointsMap.has(p.uid)) {
          mapPointsMap.set(p.uid, [new Point(parseFloat(p.lat), parseFloat(p.lon)), aqi]);
          newPts.push([new Point(parseFloat(p.lat), parseFloat(p.lon)), aqi]);
        }}}
    );
  mapPoints = mapPoints.concat(newPts);
  mapPointHandler(newPts);
}

var bnds = map.getBounds();

search(
  bnds._northEast.lat,
  bnds._northEast.lng,
  bnds._southWest.lat,
  bnds._southWest.lng,
  fetchHandler
  );



var oldCenter = new Point(0,0);

map.addEventListener("moveend", pointAdder);

function pointAdder() {

      var bnds = map.getBounds();

      search(
        bnds._northEast.lat,
        bnds._northEast.lng,
        bnds._southWest.lat,
        bnds._southWest.lng,
        fetchHandler
        );

      if (mapPoints.length > 10000)
      {
        map.removeEventListener("moveend", pointAdder, false);
      }
}

map.addEventListener("move", function() {
    var center = map.getCenter();
      var centerPoint = new Point(center.lat, center.lng);
      //var closest = quickSortPt(mapPoints, centerPoint).slice(0,nb_oscs+1);
      var closest = mapPoints.sort((p,u) => p[0].dist(centerPoint) - u[0].dist(centerPoint)).slice(0,nb_oscs+1);

      var mjau = new Array();
      for (let i = 0; i < nb_oscs; ++i) {
        mjau[i] = closest[i][1];
      }
      var hej = sum(mjau)/nb_oscs;
      intensity = scale(hej, 0, 200, 125, 25);

      console.log(hej)
      if (typeof(closest) !== 'undefined' && oldCenter.dist(centerPoint) > 0.001) {
        for (let i = 0; i < nb_oscs; ++i) {
            var euc = centerPoint.dist(closest[i][0]);
            var px  = (closest[i][0].x-centerPoint.x);
            var py = (closest[i][0].y-centerPoint.y);

            oscs[i].linearRampToDissAtTime(clip(20000*Math.exp(-closest[i][1]/30)+3, 3,20000), audioCtx.currentTime+0.05);
            if (pannerNodes[i].positionY) {
              pannerNodes[i].positionX.linearRampToValueAtTime(px, audioCtx.currentTime+0.1);
              pannerNodes[i].positionY.linearRampToValueAtTime(py, audioCtx.currentTime+0.1);
            }
            else {
              pannerNodes[i].setPosition(px,py,0);
            }
            gainNodes[i].gain.linearRampToValueAtTime(
              0.25*Math.exp(-euc/50)/(nb_oscs*2),
              audioCtx.currentTime + 0.01
            );

        }
      }
      oldCenter = centerPoint;
});