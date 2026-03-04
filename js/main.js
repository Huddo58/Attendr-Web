document.addEventListener("DOMContentLoaded", () => {

function startCarousel(selector) {

const images = document.querySelectorAll(selector);

if (!images.length) return;

let index = 0;

setInterval(() => {

images[index].classList.remove("active");

index++;

if (index >= images.length) index = 0;

images[index].classList.add("active");

}, 3500);

}

/* Hero carousel */
startCarousel(".hero-image");

/* Admin carousel */
startCarousel(".carousel-image");

});