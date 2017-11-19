(function() {

    function Slideshow( element ) {
        this.el = document.querySelector( element );
        this.init();
    }

    Slideshow.prototype = {
        init: function() {
            this.wrapper = this.el.querySelector( ".slider-wrapper" );
            this.slides = this.el.querySelectorAll( ".slide" );
            this.index = 0;
            this.total = this.slides.length;
            this.timer = null;
			this.nextButton = document.querySelector('#next');
			this.previousButton = document.querySelector('#previous');
			this.toggleButton = document.querySelector('#toggle');
            this.action();
            this.stopStart();
			this.toggleButton.addEventListener('click', function(e){
				e.preventDefault();
				this.stop();
			}.bind(this));
			this.nextButton.addEventListener('click', function(e){
				e.preventDefault();
				this.next();
			}.bind(this));
			this.previousButton.addEventListener('click', function(e){
				e.preventDefault();
				this.previous();
			}.bind(this))
        },
        _slideTo: function( slide ) {
            var currentSlide = this.slides[slide];
            currentSlide.style.opacity = 1;

            for( var i = 0; i < this.slides.length; i++ ) {
                 slide = this.slides[i];
                if( slide !== currentSlide ) {
                    slide.style.opacity = 0;
                }
            }
        },
        action: function() {
            var self = this;
            this.timer = setInterval(function() {
                self.index++;
                if( self.index == self.slides.length ) {
                    self.index = 0;
                }
                self._slideTo( self.index );

            }, 5000);
        },
        stopStart: function() {
            var self = this;
            self.el.addEventListener( "mouseover", function(){
					clearInterval( self.timer );
					self.timer = null;	
			}, false);
            self.el.addEventListener( "mouseout", function() {
                self.action();

            }, false);
        },
		stop: function(){
			if(this.timer){
				clearInterval( this.timer );
				this.timer = null;
				this.toggleButton.innerText = 'Play';
			}else{
				this.action();
				this.toggleButton.innerText = 'Pause';
			}
	
		},
		next: function(){
			this.index++;
			if( this.index === this.slides.length ) {
				this.index = 0;
			}
			this._slideTo(this.index);

		},
		previous: function(){
			this.index--;
			if( this.index <= 0 ) {
				this.index = this.slides.length - 1;
			}
			this._slideTo(this.index);			
		}


    };	
    document.addEventListener( "DOMContentLoaded", function() {

        var slider = new Slideshow( "#main-slider" );

    });


})();