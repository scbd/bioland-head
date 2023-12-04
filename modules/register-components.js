import { addComponent, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
    setup() {
        // addComponent({
        //     export: 'Swiper',
        //     filePath: 'swiper/vue',
        //     });
        //     addComponent({
        //         export: 'SwiperSlide',
        //         filePath: 'swiper/vue',
        //         });
        addComponent({
            export: 'Popper',
            filePath: 'vue3-popper',
            })
    },
})