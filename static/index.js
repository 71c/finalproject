var socket;

var canvas = document.createElement('canvas');
canvas.onclick = getMousePosition;

var ctx;

var image = new Image;

var width;
var height;
var chunkSize;
var chunkRows;
var chunkCols;
var chunksLoaded;

var pixel;

var currentColor = 'rgb(34, 34, 34)';

var idata;

var alreadyExpanded = false;

var colors = [
  'rgb(255, 255, 255)',
  'rgb(228, 228, 228)',
  'rgb(136, 136, 136)',
  'rgb(34, 34, 34)',
  'rgb(255, 167, 209)',
  'rgb(229, 0, 0)',
  'rgb(229, 149, 0)',
  'rgb(160, 106, 66)',
  'rgb(229, 217, 0)',
  'rgb(148, 224, 68)',
  'rgb(2, 190, 1)',
  'rgb(0, 211, 221)',
  'rgb(0, 131, 199)',
  'rgb(0, 0, 234)',
  'rgb(207, 110, 228)',
  'rgb(130, 0, 128)',
];


document.addEventListener('DOMContentLoaded', () => {
  socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port);



  // socket.emit('request image', {rectangle: getImageRectangle()});
  console.log('hi');
  socket.emit('request image dimensions');

  window.onbeforeunload = function() {
    socket.emit('exit site', {'id': localStorage.getItem('id')});
  };

  // $(window).focus(function() {
  //   socket.emit('enter tab');
  // });

  // $(window).blur(function() {
  //   socket.emit('exit tab');
  // });

  socket.on('send user count', data => {
    document.getElementById('user_count').innerHTML = data.user_count;
  });

  socket.on('give image dimensions', data => {
    width = data.width;
    height = data.height;

    chunkSize = data.chunk_size;
    chunkRows = Math.ceil(height / chunkSize);
    chunkCols = Math.ceil(width / chunkSize);
    chunksLoaded = Array(chunkRows);
    for (var i = 0; i < chunkRows; i++) {
      chunksLoaded[i] = Array(chunkCols).fill(false);
    }

    canvas.width = width;
    canvas.height = height;

    canvas.style.position = 'absolute';
    document.body.append(canvas);


    // console.log(getImageRectangle());
    socket.emit('request chunks', {chunks: getImageChunks(canvas.getBoundingClientRect()), 'first_time': true});
  });

  socket.on('send chunks', data => {
    if (data.first_time) {
      ctx = canvas.getContext('2d', { alpha: false });
      image.src = canvas.toDataURL();
      idata = ctx.createImageData(chunkSize, chunkSize);
      ctx.drawImage(image, 0, 0);
      pixel = ctx.createImageData(1, 1);
      pixel.data[3] = 255;
    }

    data.chunks.forEach(function(chunk) {
      if (! chunksLoaded[chunk.i][chunk.j]) {
        chunksLoaded[chunk.i][chunk.j] = true;
        var buffer = new Uint8ClampedArray(chunk.buffer);
        idata.data.set(buffer);
        ctx.putImageData(idata, chunk.rectangle[0], chunk.rectangle[1]);
      }
    });



    if (data.first_time) {
      panzoom(canvas, {
        smoothScroll: false,
        zoomDoubleClickSpeed: 1,
        minZoom: 1,
        maxZoom: 10
      });

      if (! localStorage.getItem('id')) {
        socket.emit('request new user id');
      } else {
        socket.emit('enter site', {'id': localStorage.getItem('id')});
      }

      // console.log(getImageRectangle());
    }


  });



  var table = document.getElementById('colors');
  var i = 0;
  for (var y = 0; y < 2; y++) {
    var row = document.createElement('tr');
    for (var x = 0; x < 8; x++) {
      var color = colors[i];
      var swatch = document.createElement('div');
      swatch.style.backgroundColor = color;
      swatch.style.width = '20px';
      swatch.style.height = '20px';
      swatch.onclick = function() {
        currentColor = this.style.backgroundColor;
      };
      var col = document.createElement('td');
      col.append(swatch);
      row.append(col);
      i++;
    }
    table.append(row);
  }

  socket.on('broadcast change pixels', data => {
    console.log('got some pixel changes');
    for (let pixel_change of data.pixel_changes) {
      pixel.data[0] = pixel_change.color[0];
      pixel.data[1] = pixel_change.color[1];
      pixel.data[2] = pixel_change.color[2];
      ctx.putImageData(pixel, pixel_change.x, pixel_change.y);
    }
  });

  socket.on('give new user id', data => {
    localStorage.setItem('id', data.id);
  });


});



function changeColor(x, y) {

  var colors = currentColor.match(/\d+/g);
  for (var i = 0; i < 3; i++)
    pixel.data[i] = parseInt(colors[i], 10);
  ctx.putImageData(pixel, x, y);


  // canvas.width--;
  var rect = canvas.getBoundingClientRect();
  var chunks = getImageChunks(rect);
  if (chunks.length > 0) {
    socket.emit('request chunks', {chunks: chunks, 'first_time': false});
    alreadyExpanded = false;
  } else if (! alreadyExpanded) {
    rect.x -= chunkSize;
    rect.y -= chunkSize;
    rect.width += chunkSize;
    rect.height += chunkSize;
    chunks = getImageChunks(rect);
    if (chunks.length > 0) {
      socket.emit('request chunks', {chunks: chunks, 'first_time': false});
      alreadyExpanded = true;
    }
  }

  socket.emit('change pixel', {
    'color': currentColor,
    'x': x,
    'y': y,
    'id': localStorage.getItem('id')
  });


}


function getMousePosition(event) {
  var rect = this.getBoundingClientRect();

  var x = event.clientX - rect.x;
  var y = event.clientY - rect.y;

  var pixelX = Math.floor(x / rect.width * width);
  var pixelY = Math.floor(y / rect.height * height);

  changeColor(pixelX, pixelY);

}


function getImageRectangle() {
  var rect = canvas.getBoundingClientRect();
  var x = Math.max(-rect.x, 0);
  var y = Math.max(-rect.y, 0);
  var pixelX = Math.floor(x / rect.width * width);
  var pixelY = Math.floor(y / rect.height * height);

  var right = window.innerWidth - rect.x;
  var bottom = window.innerHeight - rect.y;
  var pixelRight = Math.min(Math.floor(right / rect.width * width), width);
  var pixelBottom = Math.min(Math.floor(bottom / rect.height * height), height);

  var minChunkX = Math.floor(pixelX / chunkSize) * chunkSize;
  var minChunkY = Math.floor(pixelY / chunkSize) * chunkSize;
  var maxChunkRight = Math.min(Math.ceil(pixelRight / chunkSize) * chunkSize, width);
  var maxChunkBottom = Math.min(Math.ceil(pixelBottom / chunkSize) * chunkSize, height);

  return [pixelX, pixelY, pixelRight, pixelBottom];
}

function getImageChunks(rect) {
  var x = Math.max(-rect.x, 0);
  var y = Math.max(-rect.y, 0);
  var pixelX = Math.floor(x / rect.width * width);
  var pixelY = Math.floor(y / rect.height * height);

  var right = window.innerWidth - rect.x;
  var bottom = window.innerHeight - rect.y;
  var pixelRight = Math.min(Math.floor(right / rect.width * width), width);
  var pixelBottom = Math.min(Math.floor(bottom / rect.height * height), height);

  var minChunkX = Math.floor(pixelX / chunkSize) * chunkSize;
  var minChunkY = Math.floor(pixelY / chunkSize) * chunkSize;
  var maxChunkRight = Math.min(Math.ceil(pixelRight / chunkSize) * chunkSize, width);
  var maxChunkBottom = Math.min(Math.ceil(pixelBottom / chunkSize) * chunkSize, height);

  var chunks = [];
  for (var row = minChunkY; row < maxChunkBottom; row += chunkSize) {
    for (var col = minChunkX; col < maxChunkRight; col += chunkSize) {
      if (! chunksLoaded[row / chunkSize][col / chunkSize]) {
        chunks.push({
          rectangle: [col, row, Math.min(col + chunkSize, width), Math.min(row + chunkSize, height)],
          i: row / chunkSize,
          j: col / chunkSize
        });
      }
    }
  }
  return chunks;
}