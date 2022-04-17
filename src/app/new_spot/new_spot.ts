import { Component, ElementRef, Inject, Input, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { FirebaseService, SpotDB } from '../services/firebase_service';
import { iconColorMap, iconLabelMap, loadingColorMap } from '../services/marker_icon';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { resizeImg } from '../image_processing';
import { ConfirmDialog } from '../confirm_dialog/confirm_dialog';
import { NewSpotDialogComponent } from '../new_spot_dialog/new_spot_dialog';

@Component({
  selector: 'new-spot',
  templateUrl: 'new_spot.html',
  styleUrls: ['./new_spot.scss'],
})
export class NewSpotComponent implements OnInit {
  @Input() edit = false;
  @Input() spotData?: SpotDB;
  @ViewChild('spotInput') spotInput!: ElementRef;
  @ViewChild('tagInput', { read: MatAutocompleteTrigger })
  tagInput!: MatAutocompleteTrigger;

  placesAutocomplete!: google.maps.places.Autocomplete;
  selectedPlaceId?: string;
  lat?: number;
  lng?: number;
  name = '';
  address = '';
  originalAddress = '';
  editAddress = false;

  selectedCategory?: string;
  categories = ['Hike', 'Food', 'Accommodation'];
  selectedIcon?: string;
  icons = [
    { label: iconLabelMap['favorite'], icon: 'favorite', color: iconColorMap['favorite'] },
    {
      label: iconLabelMap['check_circle'],
      icon: 'check_circle',
      color: iconColorMap['check_circle'],
    },
    { label: iconLabelMap['thumb_down'], icon: 'thumb_down', color: iconColorMap['thumb_down'] },
  ];
  tags: Set<string> = new Set<string>();
  tagValue = '';
  tagOptions = [
    'shade',
    'easy',
    'moderate',
    'difficult',
    'landscape',
    'toilet',
    'picnic',
    'shower',
    'fire pit',
    'parking diffcult',
  ];
  filteredTagOptions: string[] = [];
  notes = '';
  // Selecting a new file will populate only previewURL and file (storageURL will be undefined);
  // Already uploaded file will only populate storageURL(previewURL and file will be undefined).
  uploadImages: { previewURL?: SafeUrl; file?: File; storageURL?: string }[] = [];

  loading = false;
  loadingColor = '';

  constructor(
    private readonly domSanitizer: DomSanitizer,
    private readonly firebaseService: FirebaseService,
    private readonly matDialogRef: MatDialogRef<NewSpotDialogComponent>,
    private readonly matSnackBar: MatSnackBar,
    private readonly matDialog: MatDialog
  ) {
    this.filterTags();
  }

  ngOnInit() {
    const spot = this.spotData;
    if (!this.edit || !spot) {
      return;
    }
    this.selectedPlaceId = spot.placeId;
    this.lat = spot.lat;
    this.lng = spot.lng;
    this.name = spot.name;
    this.selectedCategory = spot.category;
    this.selectedIcon = spot.icon;
    this.tags = new Set(spot.tags);
    this.notes = spot.notes;
    this.uploadImages = spot.images.map((img) => ({ storageURL: img }));
    let geocoder = new google.maps.Geocoder();
    geocoder
      .geocode({ placeId: this.selectedPlaceId })
      .then(({ results }) => {
        if (results[0]) {
          this.address = results[0].formatted_address;
          this.originalAddress = this.address;
        }
      })
      .catch((e) => {
        console.error('Geocoder failed due to: ', e);
      });
  }

  ngAfterViewInit() {
    this.placesAutocomplete = new google.maps.places.Autocomplete(this.spotInput.nativeElement, {
      fields: ['place_id', 'geometry', 'icon', 'name'],
    });
    this.placesAutocomplete.addListener('place_changed', () => {
      const place = this.placesAutocomplete.getPlace();
      if (place.geometry?.location) {
        this.selectedPlaceId = place.place_id;
        this.lat = place.geometry.location.lat();
        this.lng = place.geometry.location.lng();
        if (!this.edit) {
          this.name = place.name ?? '';
        }
      } else {
        this.selectedPlaceId = undefined;
        this.lat = undefined;
        this.lng = undefined;
        if (!this.edit) {
          this.name = '';
        }
      }
    });
  }

  ngOnDestroy() {
    google.maps.event.clearInstanceListeners(this.placesAutocomplete);
  }

  filterTags() {
    const keyword = this.tagValue.trim().toLowerCase();
    const removeDupOpt = [];
    for (const tag of this.tagOptions) {
      if (!this.tags.has(tag)) {
        removeDupOpt.push(tag);
      }
    }
    if (!keyword) {
      this.filteredTagOptions = removeDupOpt;
    } else {
      // this.filteredTagOptions = [
      //   this.tagValue,
      //   ...this.tagOptions.filter((tag) => tag.toLowerCase().includes(keyword)),
      // ];
      let hasTagValue = false;
      this.filteredTagOptions = [];
      for (const tag of removeDupOpt) {
        if (tag.toLowerCase().includes(keyword)) {
          this.filteredTagOptions.push(tag);
          if (tag === this.tagValue) {
            hasTagValue = true;
          }
        }
      }
      if (!hasTagValue) {
        this.filteredTagOptions.unshift(this.tagValue);
      }
    }
  }

  addTag(tagValue: string) {
    if (!tagValue) return;

    this.tags.add(tagValue);
    setTimeout(() => {
      this.tagValue = '';
      this.tagInput.openPanel();
    });
  }

  onSelectImg(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    for (let i = 0; i < files.length; ++i) {
      resizeImg(files[i], 'image.png', 800, 800)
        .then(({ file }) => {
          this.uploadImages.push({
            file,
            previewURL: this.domSanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file)),
          });
        })
        .catch((error) => {
          // TODO: color too dark
          this.matSnackBar.open(error.message, 'Dismiss');
        });
    }
  }

  moveImage(index: number, newIndex: number) {
    if (
      index < 0 ||
      index >= this.uploadImages.length ||
      newIndex < 0 ||
      newIndex >= this.uploadImages.length
    ) {
      return;
    }
    const temp = this.uploadImages[index];
    this.uploadImages[index] = this.uploadImages[newIndex];
    this.uploadImages[newIndex] = temp;
  }

  onSave(): void {
    if (
      this.loading ||
      this.lat === undefined ||
      this.lng === undefined ||
      !this.selectedPlaceId ||
      !this.selectedCategory ||
      !this.selectedIcon ||
      !this.name
    ) {
      return;
    }
    this.loadingColor = loadingColorMap[this.selectedIcon];
    this.loading = true;

    this.firebaseService
      .createSpot({
        edit: this.edit,
        placeId: this.selectedPlaceId,
        name: this.name,
        lat: this.lat,
        lng: this.lng,
        category: this.selectedCategory,
        icon: this.selectedIcon,
        tags: [...this.tags],
        notes: this.notes,
        images: this.uploadImages.map((image) => ({
          file: image.file,
          storageURL: image.storageURL,
        })),
      })
      .then(() => {
        this.matDialogRef.close();
        this.firebaseService.fetchSpots();
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  deleteSpot() {
    this.matDialog.open(ConfirmDialog, {
      maxHeight: '100vh',
      maxWidth: '100vw',
      data: {
        title: 'Are you sure you want to delete this spot?',
        description: '',
        confirmButtonText: 'Delete',
        onConfirm: () => {
          console.log('Delete!');
        },
      },
    });
  }

  changeAddress() {
    this.editAddress = true;
    const input = this.spotInput.nativeElement;
    setTimeout(() => {
      input.select();
      input.focus();
    }, 0);
  }

  cancelChangeAddress() {
    this.editAddress = false;
    this.address = this.originalAddress;
  }
}
