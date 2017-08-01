/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Layout} from '../../../src/layout';
import {CSS} from '../../../build/amp-photo-split-compare-0.1.css';

export class AmpPhotoSplitCompare extends AMP.BaseElement {

  /** @param {!AmpElement} element */
  constructor(element) {
    super(element);
    
    /** @private {!Element} */
    this.image1Container_ = document.createElement('div');
    
    /** @private {!Element} */
    this.image2Container_ = document.createElement('div');
    
    /** @private {!Element} */
    this.image1_ = document.createElement('img');
    
    /** @private {!Element} */
    this.image2_ = document.createElement('img');
    
    /** @private {!Element} */
    this.slider_ = document.createElement('div');
    
    /** @private {string} */
    this.myText_ = 'AMP Photo-Split-Compare';
    

  }

  /** @override */
  buildCallback() {
    this.buildPhotoCompareSlider();
    this.createListeners();
  }

  /** @override */
  isLayoutSupported(layout) {
    return layout == Layout.RESPONSIVE;
  }
  
  
  buildPhotoCompareSlider() {
    this.element.style.height = this.element.getAttribute('height') + 'px';
    this.element.style.width = this.element.getAttribute('width') + 'px';
    
    // Create containers
    this.image1Container_.appendChild(this.image1_);
    this.image2Container_.appendChild(this.image2_);
    this.image1Container_.className = 'image1Container';
    this.image2Container_.className = 'image2Container';
    this.image1Container_.style.width = '49%';
    
    // Create images
    this.image1_.src = this.element.getAttribute('image-1-src');
    this.image2_.src = this.element.getAttribute('image-2-src');
    this.image1_.height = this.image2_.height = this.element.getAttribute('height');
    this.image1_.width = this.image2_.width = this.element.getAttribute('width');
    this.image1_.className = 'image1';
    this.image2_.className = 'image2';
    
    // Create Slider
    this.slider_.className = 'slider';
    
    // Add newly created elements to the view
    this.element.appendChild(this.image1Container_);
    this.element.appendChild(this.image2Container_);
    this.element.appendChild(this.slider_);
    
    
    
    
  }
  
  createListeners() { 
    this.slider_.addEventListener('mousedown', this.sliderBeginsMoving.bind(this));
    this.slider_.addEventListener('touchstart', this.sliderBeginsMoving.bind(this));
    
    this.slider_.addEventListener('touchmove', this.whileSliderMoving.bind(this));
    
    this.slider_.addEventListener('touchend', this.whenSliderStops.bind(this));
  }
  
  sliderBeginsMoving(e) {
    this.startX = e.touches[0].pageX;
    this.startWidth = parseInt(window.getComputedStyle(this.element).width, 10);
  }
  
  whileSliderMoving(e) {
    this.image1Container_.style.width = e.touches[0].pageX - this.image1Container_.offsetLeft < this.element.getAttribute('width') ? (e.touches[0].pageX - this.image1Container_.offsetLeft) + 'px' : this.element.getAttribute('width') + 'px';
    this.slider_.style.left = this.image1Container_.style.width;
  }
  
  whenSliderStops(e){
  }
  
}

AMP.registerElement('amp-photo-split-compare', AmpPhotoSplitCompare, CSS);
